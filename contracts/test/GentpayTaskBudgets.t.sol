// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {GentpayTaskBudgets} from "../src/GentpayTaskBudgets.sol";
import {GentpayReceiptMath as M} from "../src/GentpayReceiptMath.sol";
import {GentpayTestToken, GentpayNoReturnToken, GentpayFalseToken, GentpayFeeToken, GentpayBlockToken, GentpayReentrantToken} from "./GentpayMocks.sol";

contract GentpayTaskBudgetsTest is Test {
    GentpayTaskBudgets gp;
    GentpayTestToken usd;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address stranger = makeAddr("stranger");
    address provCtl = makeAddr("providerController");
    address provPay = makeAddr("providerPayout");
    address prov2Ctl = makeAddr("provider2");
    uint256 pid;
    uint256 pid2;

    uint128 constant PRICE = 2_000; // 0.002 of a 6-decimal token per unit
    uint128 constant BUDGET = 5_000_000; // 5.00

    function setUp() public {
        gp = new GentpayTaskBudgets();
        usd = new GentpayTestToken("Test Dollar", "TUSD", 6);
        usd.mint(owner, 1_000_000_000);
        vm.prank(owner);
        usd.approve(address(gp), type(uint256).max);
        vm.startPrank(provCtl);
        pid = gp.registerProvider(provPay, 100, keccak256("sample provider"));
        gp.setPrice(pid, address(usd), PRICE);
        vm.stopPrank();
        vm.startPrank(prov2Ctl);
        pid2 = gp.registerProvider(prov2Ctl, 0, bytes32(0));
        gp.setPrice(pid2, address(usd), 10_000);
        vm.stopPrank();
    }

    function _task(uint128 perCall, uint128 cap) internal returns (uint256 id) {
        uint256[] memory ids = new uint256[](1);
        uint128[] memory caps = new uint128[](1);
        ids[0] = pid;
        caps[0] = cap;
        vm.prank(owner);
        id = gp.createTask(address(usd), agent, BUDGET, uint64(block.timestamp + 1 days), perCall, keccak256("task"), ids, caps);
    }

    function _pay(uint256 task, uint64 units, bytes32 req) internal returns (uint256) {
        vm.prank(agent);
        return gp.pay(task, pid, units, req, PRICE);
    }

    // ------------------------------------------------------------ happy path

    function test_payMovesExactAmountOwnerToProvider() public {
        uint256 t = _task(0, BUDGET);
        uint256 b0 = usd.balanceOf(owner);
        uint256 rid = _pay(t, 25, keccak256("GET /v1/report#1"));
        assertEq(rid, 1);
        assertEq(usd.balanceOf(provPay), 50_000);
        assertEq(usd.balanceOf(owner), b0 - 50_000);
        assertEq(usd.balanceOf(address(gp)), 0, "never holds funds");
        GentpayTaskBudgets.Task memory tk = gp.getTask(t);
        assertEq(tk.spent, 50_000);
        assertEq(tk.payments, 1);
        assertEq(gp.providerSpent(t, pid), 50_000);
    }

    function test_receiptStoresEverything() public {
        uint256 t = _task(0, BUDGET);
        bytes32 req = keccak256("req-a");
        vm.roll(777);
        uint256 rid = _pay(t, 3, req);
        GentpayTaskBudgets.Receipt memory r = gp.getReceipt(rid);
        assertEq(r.taskId, t);
        assertEq(r.providerId, pid);
        assertEq(r.units, 3);
        assertEq(r.amount, 6_000);
        assertEq(r.pricePerUnit, PRICE);
        assertEq(r.token, address(usd));
        assertEq(r.payer, owner);
        assertEq(r.payee, provPay);
        assertEq(r.caller, agent);
        assertEq(r.requestHash, req);
        assertEq(r.chainBlock, 777, "no ArbSys here: block.number");
        assertEq(r.timestamp, block.timestamp);
        (uint256 id2, GentpayTaskBudgets.Receipt memory r2) = gp.receiptFor(t, req);
        assertEq(id2, rid);
        assertEq(r2.amount, r.amount);
        (uint256 none,) = gp.receiptFor(t, keccak256("other"));
        assertEq(none, 0);
    }

    function test_paidEvent() public {
        uint256 t = _task(0, BUDGET);
        bytes32 req = keccak256("ev");
        vm.expectEmit(true, true, true, true, address(gp));
        emit GentpayTaskBudgets.Paid(1, t, pid, address(usd), provPay, agent, 4_000, 2, PRICE, req);
        _pay(t, 2, req);
    }

    function test_ownerMayPayToo() public {
        uint256 t = _task(0, BUDGET);
        vm.prank(owner);
        gp.pay(t, pid, 1, keccak256("o"), PRICE);
        assertEq(usd.balanceOf(provPay), PRICE);
    }

    function test_checkPayMatchesPay() public {
        uint256 t = _task(0, BUDGET);
        (uint256 r, uint128 amount, uint256 left) = gp.checkPay(t, pid, 10, keccak256("x"), PRICE, agent);
        assertEq(r, 0);
        assertEq(amount, 20_000);
        assertEq(left, BUDGET);
    }

    // ------------------------------------------------------------ refusals (each with its reason bit)

    function _expectRefused(uint256 t, uint256 provider, uint64 units, bytes32 req, uint128 maxPrice, address caller, uint256 bit) internal {
        (uint256 r,,) = gp.checkPay(t, provider, units, req, maxPrice, caller);
        assertTrue(r & bit != 0, "bit not set in check");
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(GentpayTaskBudgets.Refused.selector, r));
        gp.pay(t, provider, units, req, maxPrice);
    }

    function test_refuse_noTask() public {
        _expectRefused(99, pid, 1, keccak256("a"), PRICE, agent, M.NO_TASK);
    }

    function test_refuse_stranger() public {
        uint256 t = _task(0, BUDGET);
        _expectRefused(t, pid, 1, keccak256("a"), PRICE, stranger, M.NOT_AGENT);
    }

    function test_refuse_overBudgetExact() public {
        uint256[] memory ids = new uint256[](1);
        uint128[] memory caps = new uint128[](1);
        ids[0] = pid;
        caps[0] = 1_000_000;
        vm.prank(owner);
        uint256 t = gp.createTask(address(usd), agent, 10_000, uint64(block.timestamp + 1 days), 0, 0, ids, caps);
        _pay(t, 5, keccak256("a")); // 10_000 = whole budget
        _expectRefused(t, pid, 1, keccak256("b"), PRICE, agent, M.OVER_BUDGET);
    }

    function test_refuse_perCallCap() public {
        uint256 t = _task(5_000, BUDGET);
        _expectRefused(t, pid, 3, keccak256("a"), PRICE, agent, M.OVER_CALL_CAP);
        _pay(t, 2, keccak256("b")); // 4_000 ok
    }

    function test_refuse_providerCap() public {
        uint256 t = _task(0, 10_000);
        _pay(t, 4, keccak256("a")); // 8_000
        _expectRefused(t, pid, 2, keccak256("b"), PRICE, agent, M.OVER_PROVIDER_CAP);
        _pay(t, 1, keccak256("c")); // 10_000, exactly the cap
    }

    function test_refuse_unapprovedProvider() public {
        uint256 t = _task(0, BUDGET);
        _expectRefused(t, pid2, 1, keccak256("a"), 10_000, agent, M.PROVIDER_NOT_APPROVED);
    }

    function test_refuse_unknownProvider() public {
        uint256 t = _task(0, BUDGET);
        _expectRefused(t, 42, 1, keccak256("a"), PRICE, agent, M.PROVIDER_UNKNOWN);
    }

    function test_refuse_providerPaused() public {
        uint256 t = _task(0, BUDGET);
        vm.prank(provCtl);
        gp.updateProvider(pid, provPay, false, 100, 0);
        _expectRefused(t, pid, 1, keccak256("a"), PRICE, agent, M.PROVIDER_PAUSED);
    }

    function test_refuse_priceRaisedAfterQuote() public {
        uint256 t = _task(0, BUDGET);
        vm.prank(provCtl);
        gp.setPrice(pid, address(usd), PRICE * 10);
        _expectRefused(t, pid, 1, keccak256("a"), PRICE, agent, M.PRICE_ABOVE_MAX);
    }

    function test_refuse_noPriceForToken() public {
        GentpayTestToken other = new GentpayTestToken("Other", "OTH", 18);
        uint256[] memory ids = new uint256[](1);
        uint128[] memory caps = new uint128[](1);
        ids[0] = pid;
        caps[0] = 1e18;
        vm.prank(owner);
        uint256 t = gp.createTask(address(other), agent, 1e18, uint64(block.timestamp + 1 days), 0, 0, ids, caps);
        _expectRefused(t, pid, 1, keccak256("a"), PRICE, agent, M.NO_PRICE);
    }

    function test_refuse_unitsZeroAndTooMany() public {
        uint256 t = _task(0, BUDGET);
        _expectRefused(t, pid, 0, keccak256("a"), PRICE, agent, M.UNITS_INVALID);
        _expectRefused(t, pid, 101, keccak256("a"), PRICE, agent, M.UNITS_INVALID);
    }

    function test_refuse_replayedRequest() public {
        uint256 t = _task(0, BUDGET);
        _pay(t, 1, keccak256("same"));
        _expectRefused(t, pid, 1, keccak256("same"), PRICE, agent, M.REQUEST_USED);
    }

    function test_sameRequestHashInAnotherTaskIsFine() public {
        uint256 t1 = _task(0, BUDGET);
        uint256 t2 = _task(0, BUDGET);
        _pay(t1, 1, keccak256("same"));
        _pay(t2, 1, keccak256("same"));
    }

    function test_refuse_emptyRequest() public {
        uint256 t = _task(0, BUDGET);
        _expectRefused(t, pid, 1, bytes32(0), PRICE, agent, M.REQUEST_EMPTY);
    }

    function test_refuse_expired() public {
        uint256 t = _task(0, BUDGET);
        vm.warp(block.timestamp + 1 days + 1);
        _expectRefused(t, pid, 1, keccak256("a"), PRICE, agent, M.TASK_EXPIRED);
    }

    function test_refuse_pausedThenResumed() public {
        uint256 t = _task(0, BUDGET);
        vm.prank(owner);
        gp.pauseTask(t);
        _expectRefused(t, pid, 1, keccak256("a"), PRICE, agent, M.TASK_PAUSED);
        vm.prank(owner);
        gp.resumeTask(t);
        _pay(t, 1, keccak256("a"));
    }

    function test_refuse_closedIsFinal() public {
        uint256 t = _task(0, BUDGET);
        _pay(t, 1, keccak256("a"));
        vm.expectEmit(true, false, false, true, address(gp));
        emit GentpayTaskBudgets.TaskClosed(t, PRICE, BUDGET - PRICE, 1);
        vm.prank(owner);
        gp.closeTask(t);
        _expectRefused(t, pid, 1, keccak256("b"), PRICE, agent, M.TASK_CLOSED);
        vm.prank(owner);
        vm.expectRevert(GentpayTaskBudgets.BadInput.selector);
        gp.resumeTask(t);
    }

    function test_refuse_allowanceAndBalance() public {
        uint256 t = _task(0, BUDGET);
        vm.prank(owner);
        usd.approve(address(gp), 1_000);
        _expectRefused(t, pid, 1, keccak256("a"), PRICE, agent, M.ALLOWANCE_LOW);
        vm.prank(owner);
        usd.approve(address(gp), type(uint256).max);
        uint256 bal = usd.balanceOf(owner);
        vm.prank(owner);
        usd.transfer(stranger, bal - 1_000);
        _expectRefused(t, pid, 1, keccak256("a"), PRICE, agent, M.BALANCE_LOW);
    }

    function test_refuse_payeeIsPayer() public {
        vm.startPrank(owner);
        uint256 own = gp.registerProvider(owner, 0, 0);
        gp.setPrice(own, address(usd), 1);
        uint256[] memory ids = new uint256[](1);
        uint128[] memory caps = new uint128[](1);
        ids[0] = own;
        caps[0] = 100;
        uint256 t = gp.createTask(address(usd), agent, 100, uint64(block.timestamp + 1 days), 0, 0, ids, caps);
        vm.stopPrank();
        _expectRefused(t, own, 1, keccak256("a"), 1, agent, M.PAYEE_IS_PAYER);
    }

    function test_refuse_costOverflow() public {
        vm.prank(provCtl);
        gp.setPrice(pid, address(usd), type(uint128).max);
        uint256 t = _task(0, BUDGET);
        _expectRefused(t, pid, 2, keccak256("a"), type(uint128).max, agent, M.COST_OVERFLOW);
    }

    function test_reasonsCombine() public {
        uint256 t = _task(1_000, 1_000);
        vm.prank(owner);
        gp.pauseTask(t);
        (uint256 r,,) = gp.checkPay(t, pid, 50, keccak256("z"), 1, stranger);
        assertEq(r, M.TASK_PAUSED | M.NOT_AGENT | M.PRICE_ABOVE_MAX | M.OVER_CALL_CAP | M.OVER_PROVIDER_CAP);
    }

    // ------------------------------------------------------------ powers

    function test_agentCannotChangeLimits() public {
        uint256 t = _task(0, BUDGET);
        vm.startPrank(agent);
        vm.expectRevert(GentpayTaskBudgets.NotTaskOwner.selector);
        gp.setTaskLimits(t, BUDGET * 2, uint64(block.timestamp + 2 days), 0);
        vm.expectRevert(GentpayTaskBudgets.NotTaskOwner.selector);
        gp.setTaskProvider(t, pid2, 1e9);
        vm.expectRevert(GentpayTaskBudgets.NotTaskOwner.selector);
        gp.setTaskAgent(t, stranger);
        vm.expectRevert(GentpayTaskBudgets.NotTaskOwner.selector);
        gp.resumeTask(t);
        vm.expectRevert(GentpayTaskBudgets.NotTaskOwner.selector);
        gp.closeTask(t);
        vm.stopPrank();
    }

    function test_onlyControllerSetsPrice() public {
        vm.prank(stranger);
        vm.expectRevert(GentpayTaskBudgets.NotController.selector);
        gp.setPrice(pid, address(usd), 1);
        vm.prank(provCtl);
        gp.setController(pid, stranger);
        vm.prank(provCtl);
        vm.expectRevert(GentpayTaskBudgets.NotController.selector);
        gp.setPrice(pid, address(usd), 1);
        vm.prank(stranger);
        gp.setPrice(pid, address(usd), 1);
    }

    function test_budgetCannotGoBelowSpent() public {
        uint256 t = _task(0, BUDGET);
        _pay(t, 10, keccak256("a"));
        vm.prank(owner);
        vm.expectRevert(GentpayTaskBudgets.BadInput.selector);
        gp.setTaskLimits(t, 19_999, uint64(block.timestamp + 1 days), 0);
        vm.prank(owner);
        gp.setTaskLimits(t, 20_000, uint64(block.timestamp + 1 days), 0);
        _expectRefused(t, pid, 1, keccak256("b"), PRICE, agent, M.OVER_BUDGET);
    }

    function test_agentRotationTakesEffect() public {
        uint256 t = _task(0, BUDGET);
        vm.prank(owner);
        gp.setTaskAgent(t, stranger);
        _expectRefused(t, pid, 1, keccak256("a"), PRICE, agent, M.NOT_AGENT);
        vm.prank(stranger);
        gp.pay(t, pid, 1, keccak256("a"), PRICE);
        vm.prank(owner);
        gp.setTaskAgent(t, address(0));
        _expectRefused(t, pid, 1, keccak256("b"), PRICE, stranger, M.NOT_AGENT);
    }

    function test_createTaskValidation() public {
        uint256[] memory ids = new uint256[](0);
        uint128[] memory caps = new uint128[](0);
        vm.startPrank(owner);
        vm.expectRevert(GentpayTaskBudgets.BadInput.selector);
        gp.createTask(address(0), agent, 1, uint64(block.timestamp + 1), 0, 0, ids, caps);
        vm.expectRevert(GentpayTaskBudgets.BadInput.selector);
        gp.createTask(stranger, agent, 1, uint64(block.timestamp + 1), 0, 0, ids, caps); // no code
        vm.expectRevert(GentpayTaskBudgets.BadInput.selector);
        gp.createTask(address(usd), agent, 0, uint64(block.timestamp + 1), 0, 0, ids, caps);
        vm.expectRevert(GentpayTaskBudgets.BadInput.selector);
        gp.createTask(address(usd), agent, 1, uint64(block.timestamp), 0, 0, ids, caps);
        uint256[] memory one = new uint256[](1);
        one[0] = 99;
        uint128[] memory c1 = new uint128[](1);
        c1[0] = 1;
        vm.expectRevert(GentpayTaskBudgets.BadInput.selector);
        gp.createTask(address(usd), agent, 1, uint64(block.timestamp + 1), 0, 0, one, c1); // unknown provider
        vm.stopPrank();
    }

    function test_listsForDashboards() public {
        uint256 t1 = _task(0, BUDGET);
        uint256 t2 = _task(0, BUDGET);
        uint256[] memory o = gp.tasksOfOwner(owner);
        assertEq(o.length, 2);
        assertEq(o[1], t2);
        assertEq(gp.tasksOfAgent(agent)[0], t1);
        assertEq(gp.providersOf(provCtl)[0], pid);
        uint256[] memory tp = gp.taskProviders(t1);
        assertEq(tp.length, 1);
        assertEq(tp[0], pid);
        vm.startPrank(owner);
        gp.setTaskProvider(t1, pid2, 5);
        gp.setTaskProvider(t1, pid2, 0);
        gp.setTaskProvider(t1, pid2, 7);
        vm.stopPrank();
        assertEq(gp.taskProviders(t1).length, 2, "listed once, kept when removed");
        assertEq(gp.providerCap(t1, pid2), 7);
    }

    function test_providerListIsBounded() public {
        uint256 t = _task(0, BUDGET);
        vm.startPrank(prov2Ctl);
        for (uint256 i; i < 32; ++i) gp.registerProvider(prov2Ctl, 0, 0);
        vm.stopPrank();
        vm.startPrank(owner);
        for (uint256 i = 3; i <= 33; ++i) gp.setTaskProvider(t, i, 1);
        assertEq(gp.taskProviders(t).length, 32);
        vm.expectRevert(GentpayTaskBudgets.BadInput.selector);
        gp.setTaskProvider(t, 34, 1);
        vm.stopPrank();
    }

    function test_noEthAccepted() public {
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        (bool ok,) = address(gp).call{value: 1}("");
        assertFalse(ok);
    }

    // ------------------------------------------------------------ hostile tokens

    function _hostileTask(address token) internal returns (uint256 t) {
        vm.prank(provCtl);
        gp.setPrice(pid, token, 100);
        uint256[] memory ids = new uint256[](1);
        uint128[] memory caps = new uint128[](1);
        ids[0] = pid;
        caps[0] = 1e30;
        vm.prank(owner);
        t = gp.createTask(token, agent, 1e30, uint64(block.timestamp + 1 days), 0, 0, ids, caps);
    }

    function test_noReturnTokenWorks() public {
        GentpayNoReturnToken nr = new GentpayNoReturnToken();
        nr.mint(owner, 1e6);
        vm.prank(owner);
        nr.approve(address(gp), type(uint256).max);
        uint256 t = _hostileTask(address(nr));
        vm.prank(agent);
        gp.pay(t, pid, 3, keccak256("a"), 100);
        assertEq(nr.balanceOf(provPay), 300);
    }

    function test_falseReturningTokenRefused() public {
        GentpayFalseToken ft = new GentpayFalseToken();
        ft.mint(owner, 1e6);
        vm.prank(owner);
        ft.approve(address(gp), type(uint256).max);
        uint256 t = _hostileTask(address(ft));
        vm.prank(agent);
        vm.expectRevert(GentpayTaskBudgets.TransferFailed.selector);
        gp.pay(t, pid, 3, keccak256("a"), 100);
        assertEq(gp.getTask(t).spent, 0, "state rolled back");
    }

    function test_feeOnTransferRefused() public {
        GentpayFeeToken fee = new GentpayFeeToken();
        fee.mint(owner, 1e6);
        vm.prank(owner);
        fee.approve(address(gp), type(uint256).max);
        uint256 t = _hostileTask(address(fee));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(GentpayTaskBudgets.AmountMismatch.selector, 300, 297));
        gp.pay(t, pid, 3, keccak256("a"), 100);
    }

    function test_blockedPayeeReverts() public {
        GentpayBlockToken bt = new GentpayBlockToken();
        bt.mint(owner, 1e6);
        vm.prank(owner);
        bt.approve(address(gp), type(uint256).max);
        uint256 t = _hostileTask(address(bt));
        bt.setBlocked(provPay, true);
        vm.prank(agent);
        vm.expectRevert(GentpayTaskBudgets.TransferFailed.selector);
        gp.pay(t, pid, 1, keccak256("a"), 100);
        assertEq(gp.receiptCount(), 0);
    }

    function test_reentrancyBlocked() public {
        GentpayReentrantToken re = new GentpayReentrantToken();
        re.mint(owner, 1e6);
        vm.prank(owner);
        re.approve(address(gp), type(uint256).max);
        uint256 t = _hostileTask(address(re));
        re.arm(address(gp), t, pid);
        vm.prank(agent);
        gp.pay(t, pid, 1, keccak256("outer"), 100);
        assertTrue(re.reentered());
        assertEq(bytes4(re.lastError()), GentpayTaskBudgets.Reentrancy.selector);
        assertEq(gp.receiptCount(), 1, "only the outer payment");
        assertEq(re.balanceOf(provPay), 100);
    }

    // ------------------------------------------------------------ fuzz

    function testFuzz_neverOverspends(uint64 units, uint128 budget, uint128 perCall, uint128 cap) public {
        budget = uint128(bound(budget, 1, 1e12));
        units = uint64(bound(units, 0, 200));
        uint256[] memory ids = new uint256[](1);
        uint128[] memory caps = new uint128[](1);
        ids[0] = pid;
        caps[0] = uint128(bound(cap, 1, 1e12));
        vm.prank(owner);
        uint256 t = gp.createTask(address(usd), agent, budget, uint64(block.timestamp + 1 days), perCall, 0, ids, caps);
        (uint256 r, uint128 amount,) = gp.checkPay(t, pid, units, keccak256("f"), PRICE, agent);
        vm.prank(agent);
        if (r == 0) {
            gp.pay(t, pid, units, keccak256("f"), PRICE);
            assertEq(amount, uint256(PRICE) * units);
            assertLe(gp.getTask(t).spent, budget);
            assertLe(gp.providerSpent(t, pid), caps[0]);
            if (perCall != 0) assertLe(amount, perCall);
        } else {
            vm.expectRevert(abi.encodeWithSelector(GentpayTaskBudgets.Refused.selector, r));
            gp.pay(t, pid, units, keccak256("f"), PRICE);
        }
        assertEq(usd.balanceOf(address(gp)), 0);
    }

    function testFuzz_costMath(uint256 price, uint256 units) public pure {
        (uint128 a, bool ok) = M.cost(price, units);
        if (price == 0 || units == 0) {
            assertTrue(ok);
            assertEq(a, 0);
        } else if (ok) {
            assertEq(uint256(a), price * units);
        } else {
            assertGt(price, type(uint128).max / units);
        }
    }
}
