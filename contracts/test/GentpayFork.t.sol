// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {GentpayTaskBudgets} from "../src/GentpayTaskBudgets.sol";
import {GentpayReceiptMath as M} from "../src/GentpayReceiptMath.sol";

interface GentpayIERC20Fork {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

/// Runs only against a Robinhood Chain fork:
/// forge test --match-contract Fork --fork-url <RH RPC> --evm-version cancun
contract GentpayForkTest is Test {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168; // Global Dollar, 6 decimals
    address constant USDE = 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34; // USDe, 18 decimals

    GentpayTaskBudgets gp;
    address owner = makeAddr("fork-owner");
    address agent = makeAddr("fork-agent");
    address payout = makeAddr("fork-payout");
    uint256 pid;

    modifier onlyRh() {
        if (block.chainid != 4663) {
            vm.skip(true);
        }
        _;
    }

    function setUp() public {
        if (block.chainid != 4663) return;
        gp = new GentpayTaskBudgets();
        vm.prank(payout);
        pid = gp.registerProvider(payout, 1000, keccak256("fork provider"));
    }

    function _run(address token, uint128 price, uint128 budget) internal {
        assertGt(token.code.length, 0);
        deal(token, owner, uint256(budget) * 2);
        vm.prank(owner);
        GentpayIERC20Fork(token).approve(address(gp), budget);
        vm.prank(payout);
        gp.setPrice(pid, token, price);
        uint256[] memory ids = new uint256[](1);
        uint128[] memory caps = new uint128[](1);
        ids[0] = pid;
        caps[0] = budget;
        vm.prank(owner);
        uint256 t = gp.createTask(token, agent, budget, uint64(block.timestamp + 1 days), 0, keccak256("fork task"), ids, caps);
        uint256 before = GentpayIERC20Fork(token).balanceOf(payout);
        vm.prank(agent);
        uint256 rid = gp.pay(t, pid, 5, keccak256("GET /api/provider/sample?topic=eth#1"), price);
        assertEq(GentpayIERC20Fork(token).balanceOf(payout) - before, uint256(price) * 5, "exact amount arrived");
        assertEq(GentpayIERC20Fork(token).balanceOf(address(gp)), 0);
        GentpayTaskBudgets.Receipt memory r = gp.getReceipt(rid);
        assertEq(r.amount, uint256(price) * 5);
        // spend the rest exactly, then one more unit is refused for budget
        uint64 rest = uint64((budget - r.amount) / price);
        vm.prank(agent);
        gp.pay(t, pid, rest, keccak256("rest"), price);
        (uint256 reasons,,) = gp.checkPay(t, pid, 1, keccak256("over"), price, agent);
        assertTrue(reasons & M.OVER_BUDGET != 0);
    }

    function test_fork_usdg() public onlyRh {
        assertEq(GentpayIERC20Fork(USDG).decimals(), 6);
        assertEq(keccak256(bytes(GentpayIERC20Fork(USDG).symbol())), keccak256("USDG"));
        _run(USDG, 2_000, 1_000_000); // 0.002 USDG per unit, 1 USDG budget
    }

    function test_fork_usde() public onlyRh {
        assertEq(GentpayIERC20Fork(USDE).decimals(), 18);
        _run(USDE, 2e15, 1e18);
    }

    function test_fork_allowanceRefusedBeforeSigning() public onlyRh {
        deal(USDG, owner, 1_000_000);
        vm.prank(payout);
        gp.setPrice(pid, USDG, 2_000);
        uint256[] memory ids = new uint256[](1);
        uint128[] memory caps = new uint128[](1);
        ids[0] = pid;
        caps[0] = 1_000_000;
        vm.prank(owner);
        uint256 t = gp.createTask(USDG, agent, 1_000_000, uint64(block.timestamp + 1 days), 0, 0, ids, caps);
        (uint256 reasons,,) = gp.checkPay(t, pid, 1, keccak256("a"), 2_000, agent);
        assertEq(reasons, M.ALLOWANCE_LOW);
    }

    /// ArbSys is a node precompile: a forked EVM sees only its 0xfe placeholder, so chainBlock() falls back to block.number.
    function test_fork_chainBlockFallback() public onlyRh {
        assertEq(gp.chainBlock(), uint64(block.number));
    }
}
