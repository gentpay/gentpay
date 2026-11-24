// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {GentpayTaskBudgets} from "../src/GentpayTaskBudgets.sol";
import {GentpayTestToken} from "./GentpayMocks.sol";

/// Random owners, agents and strangers create tasks, pay, pause, change limits and close; the money rules must always hold.
contract GentpayBudgetHandler is Test {
    GentpayTaskBudgets public gp;
    GentpayTestToken public usd;
    address[3] public owners;
    address public agent = address(0xA9E7);
    uint256 public pid;
    address public payout = address(0xBEEF);
    uint256 public paidTotal;
    uint256 public nonce;

    constructor(GentpayTaskBudgets g, GentpayTestToken u) {
        gp = g;
        usd = u;
        owners = [address(0x0A1), address(0x0A2), address(0x0A3)];
        for (uint256 i; i < 3; ++i) {
            usd.mint(owners[i], 1e15);
            vm.prank(owners[i]);
            usd.approve(address(gp), type(uint256).max);
        }
        vm.prank(address(0xC0));
        pid = gp.registerProvider(payout, 50, 0);
        vm.prank(address(0xC0));
        gp.setPrice(pid, address(usd), 1_000);
    }

    function create(uint8 o, uint128 budget, uint128 cap, uint128 perCall) external {
        uint256[] memory ids = new uint256[](1);
        uint128[] memory caps = new uint128[](1);
        ids[0] = pid;
        caps[0] = uint128(bound(cap, 1, 1e9));
        vm.prank(owners[o % 3]);
        gp.createTask(address(usd), agent, uint128(bound(budget, 1, 1e9)), uint64(block.timestamp + 3 days), uint128(bound(perCall, 0, 1e8)), 0, ids, caps);
    }

    function pay(uint256 task, uint64 units, bool asStranger) external {
        if (gp.taskCount() == 0) return;
        task = bound(task, 1, gp.taskCount());
        units = uint64(bound(units, 0, 60));
        bytes32 req = keccak256(abi.encode(++nonce));
        address caller = asStranger ? address(0xBAD) : agent;
        (uint256 r, uint128 amount,) = gp.checkPay(task, pid, units, req, 1_000, caller);
        vm.prank(caller);
        try gp.pay(task, pid, units, req, 1_000) {
            require(r == 0, "paid although check refused");
            paidTotal += amount;
        } catch {
            require(r != 0, "refused although check passed");
        }
    }

    function pause(uint256 task, bool on) external {
        if (gp.taskCount() == 0) return;
        task = bound(task, 1, gp.taskCount());
        GentpayTaskBudgets.Task memory t = gp.getTask(task);
        vm.prank(t.owner);
        if (on) try gp.pauseTask(task) {} catch {}
        else try gp.resumeTask(task) {} catch {}
    }

    function limits(uint256 task, uint128 budget) external {
        if (gp.taskCount() == 0) return;
        task = bound(task, 1, gp.taskCount());
        GentpayTaskBudgets.Task memory t = gp.getTask(task);
        vm.prank(t.owner);
        try gp.setTaskLimits(task, uint128(bound(budget, 1, 2e9)), uint64(block.timestamp + 1 days), 0) {} catch {}
    }

    function close(uint256 task) external {
        if (gp.taskCount() == 0) return;
        task = bound(task, 1, gp.taskCount());
        vm.prank(gp.getTask(task).owner);
        try gp.closeTask(task) {} catch {}
    }

    function warp(uint32 s) external {
        vm.warp(block.timestamp + bound(s, 0, 1 days));
    }
}

contract GentpayTaskBudgetsInvariantTest is Test {
    GentpayTaskBudgets gp;
    GentpayTestToken usd;
    GentpayBudgetHandler h;

    function setUp() public {
        gp = new GentpayTaskBudgets();
        usd = new GentpayTestToken("T", "T", 6);
        h = new GentpayBudgetHandler(gp, usd);
        targetContract(address(h));
    }

    function invariant_contractHoldsNothing() public view {
        assertEq(usd.balanceOf(address(gp)), 0);
        assertEq(address(gp).balance, 0);
    }

    function invariant_spentWithinBudgetAndCaps() public view {
        for (uint256 i = 1; i <= gp.taskCount(); ++i) {
            GentpayTaskBudgets.Task memory t = gp.getTask(i);
            assertLe(t.spent, t.budget);
            assertLe(gp.providerSpent(i, h.pid()), gp.providerCap(i, h.pid()) == 0 ? type(uint128).max : gp.providerCap(i, h.pid()));
        }
    }

    function invariant_receiptsAddUp() public view {
        uint256 sumReceipts;
        for (uint256 i = 1; i <= gp.receiptCount(); ++i) sumReceipts += gp.getReceipt(i).amount;
        uint256 sumSpent;
        for (uint256 i = 1; i <= gp.taskCount(); ++i) sumSpent += gp.getTask(i).spent;
        assertEq(sumReceipts, sumSpent);
        assertEq(sumReceipts, h.paidTotal());
        assertEq(usd.balanceOf(h.payout()), sumReceipts, "provider got exactly the receipts");
    }
}
