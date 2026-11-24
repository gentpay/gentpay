// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title GentpayReceiptMath
/// @notice Pure helpers shared by GentpayTaskBudgets and its tests: the refusal reason bits, the cost of a call and the
///         keys under which receipts are stored. The website mirrors every constant here (src/lib/gentpay/reasons.ts) and the
///         unit tests on both sides check the same table.
library GentpayReceiptMath {
    // ---- refusal reasons (bit positions are part of the public interface; never renumber) ----
    uint256 internal constant NO_TASK = 1 << 0; // task id does not exist
    uint256 internal constant TASK_CLOSED = 1 << 1; // owner closed the task (final)
    uint256 internal constant TASK_PAUSED = 1 << 2; // owner paused the task
    uint256 internal constant TASK_EXPIRED = 1 << 3; // block.timestamp is past the deadline
    uint256 internal constant NOT_AGENT = 1 << 4; // caller is neither the task's agent nor its owner
    uint256 internal constant PROVIDER_UNKNOWN = 1 << 5; // provider id does not exist
    uint256 internal constant PROVIDER_NOT_APPROVED = 1 << 6; // task owner has not approved this provider
    uint256 internal constant PROVIDER_PAUSED = 1 << 7; // provider switched itself off
    uint256 internal constant NO_PRICE = 1 << 8; // provider has no price for the task's token
    uint256 internal constant PRICE_ABOVE_MAX = 1 << 9; // current price is above what the agent accepted
    uint256 internal constant UNITS_INVALID = 1 << 10; // zero units, or more than the provider sells per call
    uint256 internal constant OVER_CALL_CAP = 1 << 11; // cost is above the task's per-call cap
    uint256 internal constant OVER_BUDGET = 1 << 12; // cost is above what is left of the task budget
    uint256 internal constant OVER_PROVIDER_CAP = 1 << 13; // cost is above what is left for this provider in this task
    uint256 internal constant REQUEST_USED = 1 << 14; // this request hash already has a receipt in this task
    uint256 internal constant REQUEST_EMPTY = 1 << 15; // request hash is zero
    uint256 internal constant ALLOWANCE_LOW = 1 << 16; // owner's allowance to the contract is below the cost
    uint256 internal constant BALANCE_LOW = 1 << 17; // owner's token balance is below the cost
    uint256 internal constant PAYEE_IS_PAYER = 1 << 18; // provider payout address is the task owner itself
    uint256 internal constant COST_OVERFLOW = 1 << 19; // price * units does not fit in uint128

    uint256 internal constant REASON_COUNT = 20;

    /// @notice Cost of `units` at `pricePerUnit`, or (0, false) when it would not fit in uint128.
    function cost(uint256 pricePerUnit, uint256 units) internal pure returns (uint128 amount, bool ok) {
        if (units == 0 || pricePerUnit == 0) return (0, true);
        if (pricePerUnit > type(uint128).max / units) return (0, false);
        return (uint128(pricePerUnit * units), true);
    }

    /// @notice Storage key for "this request was paid inside this task".
    function receiptKey(uint256 taskId, bytes32 requestHash) internal pure returns (bytes32) {
        return keccak256(abi.encode(taskId, requestHash));
    }

    /// @notice What is left of a cap after `used`, never negative.
    function left(uint256 cap, uint256 used) internal pure returns (uint256) {
        return used >= cap ? 0 : cap - used;
    }
}
