// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {GentpayReceiptMath as M} from "./GentpayReceiptMath.sol";

interface IGentpayERC20 {
    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
}

/// @title GentpayTaskBudgets
/// @notice Task budgets and receipts for AI agents that buy data or API calls.
///
/// - A task owner creates a task: one ERC-20 token, a budget, a deadline, one agent address, a per-call cap and the providers it
///   approves (each with its own cap inside the task).
/// - A provider registers once and publishes a price per unit for each token it accepts.
/// - The agent (or the owner) pays: the contract reads the provider's current price, checks every limit, stores a receipt and moves
///   the cost with transferFrom straight from the owner's wallet to the provider's payout address, in the same transaction.
///
/// Non-custodial: the contract never holds a token balance. Native ETH is not accepted (no payable function, no receive()).
/// Fee-on-transfer tokens are refused: the payee must receive exactly the cost or the payment reverts.
/// No admin, no fee, no upgrade. Only the task owner changes a task; the agent can only spend inside it.
contract GentpayTaskBudgets {
    // ---------------------------------------------------------------- types

    enum Status {
        None,
        Open,
        Paused,
        Closed
    }

    struct Task {
        address owner;
        address agent;
        address token;
        uint64 deadline;
        Status status;
        uint128 budget;
        uint128 spent;
        uint128 perCallCap; // 0 = no per-call cap
        uint64 payments;
        uint64 createdAt;
        bytes32 metaHash; // hash of the owner's off-chain task description (never the text itself)
    }

    struct Provider {
        address controller; // may change prices, payout and pause
        address payout; // receives payments
        bool active;
        uint64 maxUnitsPerCall; // 0 = no limit
        bytes32 metaHash; // hash of the provider's off-chain description (endpoint, terms)
    }

    struct Receipt {
        uint64 taskId;
        uint64 providerId;
        uint64 units;
        uint64 chainBlock; // Robinhood Chain block (ArbSys), or block.number where ArbSys does not exist
        uint64 timestamp;
        uint128 amount;
        uint128 pricePerUnit;
        address token;
        address payer; // the task owner
        address payee; // provider payout at payment time
        address caller; // agent or owner that triggered it
        bytes32 requestHash;
    }

    // ---------------------------------------------------------------- storage

    uint256 public taskCount;
    uint256 public providerCount;
    uint256 public receiptCount;

    mapping(uint256 => Task) private _tasks;
    mapping(uint256 => Provider) private _providers;
    mapping(uint256 => Receipt) private _receipts;

    /// provider id => token => price per unit (token base units). 0 = not sold for that token.
    mapping(uint256 => mapping(address => uint128)) public priceOf;
    /// task id => provider id => cap inside the task (0 = not approved).
    mapping(uint256 => mapping(uint256 => uint128)) public providerCap;
    /// task id => provider id => spent so far.
    mapping(uint256 => mapping(uint256 => uint128)) public providerSpent;
    /// keccak(taskId, requestHash) => receipt id (0 = none).
    mapping(bytes32 => uint256) public receiptIdOf;
    /// owner => task ids, provider controller => provider ids (for dashboards without log scans).
    mapping(address => uint256[]) private _tasksOfOwner;
    mapping(address => uint256[]) private _tasksOfAgent;
    mapping(address => uint256[]) private _providersOf;
    /// task id => provider ids ever approved in it (for dashboards; caps live in providerCap).
    mapping(uint256 => uint256[]) private _taskProviders;
    mapping(uint256 => mapping(uint256 => bool)) private _listed;

    uint256 public constant MAX_PROVIDERS_PER_CALL = 16;
    uint256 public constant MAX_PROVIDERS_PER_TASK = 32;
    address private constant ARBSYS = address(0x64);

    uint256 private _lock = 1;

    // ---------------------------------------------------------------- events

    event ProviderRegistered(uint256 indexed providerId, address indexed controller, address payout, uint64 maxUnitsPerCall, bytes32 metaHash);
    event ProviderUpdated(uint256 indexed providerId, address payout, bool active, uint64 maxUnitsPerCall, bytes32 metaHash);
    event ProviderControllerChanged(uint256 indexed providerId, address indexed from, address indexed to);
    event PriceSet(uint256 indexed providerId, address indexed token, uint128 pricePerUnit);

    event TaskCreated(uint256 indexed taskId, address indexed owner, address indexed agent, address token, uint128 budget, uint64 deadline, uint128 perCallCap, bytes32 metaHash);
    event TaskProviderSet(uint256 indexed taskId, uint256 indexed providerId, uint128 cap);
    event TaskLimitsChanged(uint256 indexed taskId, uint128 budget, uint64 deadline, uint128 perCallCap);
    event TaskAgentChanged(uint256 indexed taskId, address indexed agent);
    event TaskStatusChanged(uint256 indexed taskId, Status status);
    event TaskClosed(uint256 indexed taskId, uint128 spent, uint128 unspent, uint64 payments);

    event Paid(
        uint256 indexed receiptId,
        uint256 indexed taskId,
        uint256 indexed providerId,
        address token,
        address payee,
        address caller,
        uint128 amount,
        uint64 units,
        uint128 pricePerUnit,
        bytes32 requestHash
    );

    // ---------------------------------------------------------------- errors

    error Refused(uint256 reasons);
    error NotTaskOwner();
    error NotController();
    error BadInput();
    error TransferFailed();
    error AmountMismatch(uint256 expected, uint256 received);
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ================================================================ providers

    /// @notice Register as a provider. The caller becomes its controller.
    function registerProvider(address payout, uint64 maxUnitsPerCall, bytes32 metaHash) external returns (uint256 providerId) {
        if (payout == address(0)) revert BadInput();
        providerId = ++providerCount;
        _providers[providerId] = Provider({controller: msg.sender, payout: payout, active: true, maxUnitsPerCall: maxUnitsPerCall, metaHash: metaHash});
        _providersOf[msg.sender].push(providerId);
        emit ProviderRegistered(providerId, msg.sender, payout, maxUnitsPerCall, metaHash);
    }

    /// @notice Publish (or remove with 0) the price per unit for one token.
    function setPrice(uint256 providerId, address token, uint128 pricePerUnit) external {
        _onlyController(providerId);
        if (token == address(0)) revert BadInput();
        priceOf[providerId][token] = pricePerUnit;
        emit PriceSet(providerId, token, pricePerUnit);
    }

    function updateProvider(uint256 providerId, address payout, bool active, uint64 maxUnitsPerCall, bytes32 metaHash) external {
        _onlyController(providerId);
        if (payout == address(0)) revert BadInput();
        Provider storage p = _providers[providerId];
        p.payout = payout;
        p.active = active;
        p.maxUnitsPerCall = maxUnitsPerCall;
        p.metaHash = metaHash;
        emit ProviderUpdated(providerId, payout, active, maxUnitsPerCall, metaHash);
    }

    function setController(uint256 providerId, address to) external {
        _onlyController(providerId);
        if (to == address(0)) revert BadInput();
        emit ProviderControllerChanged(providerId, msg.sender, to);
        _providers[providerId].controller = to;
        _providersOf[to].push(providerId);
    }

    // ================================================================ tasks (owner)

    /// @notice Create a task. `providerIds[i]` is approved with `caps[i]` (each > 0). The caller is the owner and the payer.
    function createTask(
        address token,
        address agent,
        uint128 budget,
        uint64 deadline,
        uint128 perCallCap,
        bytes32 metaHash,
        uint256[] calldata providerIds,
        uint128[] calldata caps
    ) external returns (uint256 taskId) {
        if (token == address(0) || token.code.length == 0 || budget == 0 || deadline <= block.timestamp) revert BadInput();
        if (providerIds.length != caps.length || providerIds.length > MAX_PROVIDERS_PER_CALL) revert BadInput();
        taskId = ++taskCount;
        Task storage t = _tasks[taskId];
        t.owner = msg.sender;
        t.agent = agent;
        t.token = token;
        t.deadline = deadline;
        t.status = Status.Open;
        t.budget = budget;
        t.perCallCap = perCallCap;
        t.createdAt = uint64(block.timestamp);
        t.metaHash = metaHash;
        _tasksOfOwner[msg.sender].push(taskId);
        if (agent != address(0) && agent != msg.sender) _tasksOfAgent[agent].push(taskId);
        emit TaskCreated(taskId, msg.sender, agent, token, budget, deadline, perCallCap, metaHash);
        for (uint256 i; i < providerIds.length; ++i) _setProvider(taskId, providerIds[i], caps[i]);
    }

    /// @notice Approve a provider with a cap, change its cap, or remove it (cap 0). Works on open or paused tasks.
    function setTaskProvider(uint256 taskId, uint256 providerId, uint128 cap) external {
        _onlyOwnerOfLive(taskId);
        _setProvider(taskId, providerId, cap);
    }

    /// @notice Change budget, deadline and per-call cap. The budget can never go below what is already spent.
    function setTaskLimits(uint256 taskId, uint128 budget, uint64 deadline, uint128 perCallCap) external {
        Task storage t = _onlyOwnerOfLive(taskId);
        if (budget < t.spent || budget == 0 || deadline <= block.timestamp) revert BadInput();
        t.budget = budget;
        t.deadline = deadline;
        t.perCallCap = perCallCap;
        emit TaskLimitsChanged(taskId, budget, deadline, perCallCap);
    }

    /// @notice Rotate (or remove with address(0)) the agent key. Takes effect for the next transaction.
    function setTaskAgent(uint256 taskId, address agent) external {
        Task storage t = _onlyOwnerOfLive(taskId);
        t.agent = agent;
        if (agent != address(0) && agent != t.owner) _tasksOfAgent[agent].push(taskId);
        emit TaskAgentChanged(taskId, agent);
    }

    /// @notice Stop all payments of the task, from the next transaction in the same block onwards.
    function pauseTask(uint256 taskId) external {
        Task storage t = _onlyOwnerOfLive(taskId);
        t.status = Status.Paused;
        emit TaskStatusChanged(taskId, Status.Paused);
    }

    function resumeTask(uint256 taskId) external {
        Task storage t = _onlyOwnerOfLive(taskId);
        t.status = Status.Open;
        emit TaskStatusChanged(taskId, Status.Open);
    }

    /// @notice Close the task for good. Nothing to refund: the budget never left the owner's wallet.
    function closeTask(uint256 taskId) external {
        Task storage t = _onlyOwnerOfLive(taskId);
        t.status = Status.Closed;
        emit TaskStatusChanged(taskId, Status.Closed);
        emit TaskClosed(taskId, t.spent, t.budget - t.spent, t.payments);
    }

    // ================================================================ pay

    /// @notice Pay `units` of `providerId`'s service for `requestHash` out of task `taskId`.
    /// @param maxPricePerUnit the highest price the caller accepts (protects against a price change after the quote).
    function pay(uint256 taskId, uint256 providerId, uint64 units, bytes32 requestHash, uint128 maxPricePerUnit)
        external
        nonReentrant
        returns (uint256 receiptId)
    {
        (uint256 reasons, uint128 amount,) = _check(taskId, providerId, units, requestHash, maxPricePerUnit, msg.sender);
        if (reasons != 0) revert Refused(reasons);

        Receipt storage r;
        (receiptId, r) = _record(taskId, providerId, units, requestHash, amount);
        address token = r.token;
        address payee = r.payee;

        // interaction: owner -> provider directly, exact amount or revert
        uint256 before = IGentpayERC20(token).balanceOf(payee);
        _transferFrom(token, r.payer, payee, amount);
        uint256 received = IGentpayERC20(token).balanceOf(payee) - before;
        if (received != amount) revert AmountMismatch(amount, received);
    }

    // ================================================================ views

    /// @notice The same checks pay() runs, as a reason bitmask (0 = would pass), plus the cost and what is left of the budget.
    function checkPay(uint256 taskId, uint256 providerId, uint64 units, bytes32 requestHash, uint128 maxPricePerUnit, address caller)
        external
        view
        returns (uint256 reasons, uint128 amount, uint256 budgetLeft)
    {
        return _check(taskId, providerId, units, requestHash, maxPricePerUnit, caller);
    }

    function getTask(uint256 taskId) external view returns (Task memory) {
        return _tasks[taskId];
    }

    function getProvider(uint256 providerId) external view returns (Provider memory) {
        return _providers[providerId];
    }

    function getReceipt(uint256 receiptId) external view returns (Receipt memory) {
        return _receipts[receiptId];
    }

    /// @notice Receipt of a request inside a task (receipt id 0 and an empty struct when there is none).
    function receiptFor(uint256 taskId, bytes32 requestHash) external view returns (uint256 receiptId, Receipt memory r) {
        receiptId = receiptIdOf[M.receiptKey(taskId, requestHash)];
        r = _receipts[receiptId];
    }

    function tasksOfOwner(address owner) external view returns (uint256[] memory) {
        return _tasksOfOwner[owner];
    }

    function tasksOfAgent(address agent) external view returns (uint256[] memory) {
        return _tasksOfAgent[agent];
    }

    /// @notice Provider ids ever approved in a task (a removed one stays listed with cap 0).
    function taskProviders(uint256 taskId) external view returns (uint256[] memory) {
        return _taskProviders[taskId];
    }

    function providersOf(address controller) external view returns (uint256[] memory) {
        return _providersOf[controller];
    }

    /// @notice Robinhood Chain block number (block.number there is the parent chain's). Falls back to block.number elsewhere.
    function chainBlock() public view returns (uint64) {
        if (ARBSYS.code.length != 0) {
            (bool ok, bytes memory out) = ARBSYS.staticcall{gas: 30_000}(abi.encodeWithSignature("arbBlockNumber()"));
            if (ok && out.length == 32) return uint64(abi.decode(out, (uint256)));
        }
        return uint64(block.number);
    }

    // ================================================================ internal

    function _check(uint256 taskId, uint256 providerId, uint64 units, bytes32 requestHash, uint128 maxPricePerUnit, address caller)
        internal
        view
        returns (uint256 r, uint128 amount, uint256 budgetLeft)
    {
        Task storage t = _tasks[taskId];
        if (t.status == Status.None) return (M.NO_TASK, 0, 0);
        budgetLeft = M.left(t.budget, t.spent);
        if (t.status == Status.Closed) r |= M.TASK_CLOSED;
        if (t.status == Status.Paused) r |= M.TASK_PAUSED;
        if (block.timestamp > t.deadline) r |= M.TASK_EXPIRED;
        if (caller != t.owner && (caller != t.agent || t.agent == address(0))) r |= M.NOT_AGENT;
        if (requestHash == bytes32(0)) r |= M.REQUEST_EMPTY;
        else if (receiptIdOf[M.receiptKey(taskId, requestHash)] != 0) r |= M.REQUEST_USED;

        Provider storage p = _providers[providerId];
        if (p.controller == address(0)) return (r | M.PROVIDER_UNKNOWN, 0, budgetLeft);
        if (providerCap[taskId][providerId] == 0) r |= M.PROVIDER_NOT_APPROVED;
        if (!p.active) r |= M.PROVIDER_PAUSED;
        if (p.payout == t.owner) r |= M.PAYEE_IS_PAYER;
        if (units == 0 || (p.maxUnitsPerCall != 0 && units > p.maxUnitsPerCall)) r |= M.UNITS_INVALID;

        uint128 price = priceOf[providerId][t.token];
        if (price == 0) return (r | M.NO_PRICE, 0, budgetLeft);
        if (price > maxPricePerUnit) r |= M.PRICE_ABOVE_MAX;
        bool ok;
        (amount, ok) = M.cost(price, units);
        if (!ok) return (r | M.COST_OVERFLOW, 0, budgetLeft);
        if (units == 0) return (r, 0, budgetLeft);

        r |= _checkMoney(taskId, providerId, amount, budgetLeft);
    }

    function _checkMoney(uint256 taskId, uint256 providerId, uint128 amount, uint256 budgetLeft) private view returns (uint256 r) {
        Task storage t = _tasks[taskId];
        uint128 cap = providerCap[taskId][providerId];
        if (t.perCallCap != 0 && amount > t.perCallCap) r |= M.OVER_CALL_CAP;
        if (amount > budgetLeft) r |= M.OVER_BUDGET;
        if (cap != 0 && amount > M.left(cap, providerSpent[taskId][providerId])) r |= M.OVER_PROVIDER_CAP;
        if (_readOr(t.token, abi.encodeCall(IGentpayERC20.allowance, (t.owner, address(this)))) < amount) r |= M.ALLOWANCE_LOW;
        if (_readOr(t.token, abi.encodeCall(IGentpayERC20.balanceOf, (t.owner))) < amount) r |= M.BALANCE_LOW;
    }

    function _record(uint256 taskId, uint256 providerId, uint64 units, bytes32 requestHash, uint128 amount)
        private
        returns (uint256 receiptId, Receipt storage r)
    {
        Task storage t = _tasks[taskId];
        t.spent += amount;
        t.payments += 1;
        providerSpent[taskId][providerId] += amount;
        receiptId = ++receiptCount;
        receiptIdOf[M.receiptKey(taskId, requestHash)] = receiptId;
        r = _receipts[receiptId];
        r.taskId = uint64(taskId);
        r.providerId = uint64(providerId);
        r.units = units;
        r.chainBlock = chainBlock();
        r.timestamp = uint64(block.timestamp);
        r.amount = amount;
        r.pricePerUnit = priceOf[providerId][t.token];
        r.token = t.token;
        r.payer = t.owner;
        r.payee = _providers[providerId].payout;
        r.caller = msg.sender;
        r.requestHash = requestHash;
        emit Paid(receiptId, taskId, providerId, r.token, r.payee, msg.sender, amount, units, r.pricePerUnit, requestHash);
    }

    function _setProvider(uint256 taskId, uint256 providerId, uint128 cap) private {
        if (_providers[providerId].controller == address(0)) revert BadInput();
        if (cap != 0 && cap < providerSpent[taskId][providerId]) revert BadInput();
        if (cap != 0 && !_listed[taskId][providerId]) {
            if (_taskProviders[taskId].length >= MAX_PROVIDERS_PER_TASK) revert BadInput();
            _listed[taskId][providerId] = true;
            _taskProviders[taskId].push(providerId);
        }
        providerCap[taskId][providerId] = cap;
        emit TaskProviderSet(taskId, providerId, cap);
    }

    function _onlyOwnerOfLive(uint256 taskId) private view returns (Task storage t) {
        t = _tasks[taskId];
        if (t.owner != msg.sender) revert NotTaskOwner();
        if (t.status == Status.Closed) revert BadInput();
    }

    function _onlyController(uint256 providerId) private view {
        if (_providers[providerId].controller != msg.sender || msg.sender == address(0)) revert NotController();
    }

    /// A uint256 view on the token, or 0 when it reverts or answers oddly (the check then reports a low allowance/balance).
    function _readOr(address token, bytes memory data) private view returns (uint256 v) {
        (bool ok, bytes memory out) = token.staticcall{gas: 100_000}(data);
        if (ok && out.length >= 32) v = abi.decode(out, (uint256));
    }

    /// transferFrom that accepts tokens returning nothing (USDT style) and rejects tokens returning false.
    function _transferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory out) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (out.length != 0 && (out.length < 32 || !abi.decode(out, (bool))))) revert TransferFailed();
    }
}
