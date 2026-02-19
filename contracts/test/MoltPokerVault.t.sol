// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoltPokerVault.sol";
import "../src/mocks/MockUSDC.sol";

contract MoltPokerVaultTest is Test {
    MoltPokerVault public vault;
    MockUSDC public usdc;

    address admin = address(0x1);
    address settler = address(0x2);
    address player1 = address(0x100);
    address player2 = address(0x200);

    bytes32 tableId = keccak256("table:test-table-1");
    bytes32 agentId1 = keccak256("agent:agent-1");
    bytes32 agentId2 = keccak256("agent:agent-2");

    uint256 constant DEPOSIT_AMOUNT = 10 * 10**6; // 10 USDC

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC();

        // Deploy vault
        vault = new MoltPokerVault(address(usdc), admin);

        // Mint USDC to players
        usdc.mint(player1, 100 * 10**6);
        usdc.mint(player2, 100 * 10**6);

        // Grant settler role
        bytes32 settlerRole = vault.SETTLER_ROLE();
        vm.prank(admin);
        vault.grantRole(settlerRole, settler);
    }

    function testDeposit() public {
        // Approve vault to spend USDC
        vm.prank(player1);
        usdc.approve(address(vault), DEPOSIT_AMOUNT);

        // Deposit
        vm.prank(player1);
        vault.deposit(tableId, agentId1, DEPOSIT_AMOUNT);

        // Check vault balance
        assertEq(usdc.balanceOf(address(vault)), DEPOSIT_AMOUNT);
    }

    function testSettlePayout() public {
        // Setup: player deposits
        vm.startPrank(player1);
        usdc.approve(address(vault), DEPOSIT_AMOUNT);
        vault.deposit(tableId, agentId1, DEPOSIT_AMOUNT);
        vm.stopPrank();

        // Settle payout
        vm.prank(settler);
        vault.settlePayout(tableId, agentId1, player1, DEPOSIT_AMOUNT);

        // Check balances
        assertEq(usdc.balanceOf(player1), 100 * 10**6); // Full amount returned
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function testSettleRefund() public {
        // Setup: player deposits
        vm.startPrank(player1);
        usdc.approve(address(vault), DEPOSIT_AMOUNT);
        vault.deposit(tableId, agentId1, DEPOSIT_AMOUNT);
        vm.stopPrank();

        // Settle refund
        vm.prank(settler);
        vault.settleRefund(tableId, agentId1, player1, DEPOSIT_AMOUNT);

        // Check balances
        assertEq(usdc.balanceOf(player1), 100 * 10**6); // Full amount returned
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function testCannotSettleTwice() public {
        // Setup: player deposits
        vm.startPrank(player1);
        usdc.approve(address(vault), DEPOSIT_AMOUNT);
        vault.deposit(tableId, agentId1, DEPOSIT_AMOUNT);
        vm.stopPrank();

        // First settlement
        vm.prank(settler);
        vault.settlePayout(tableId, agentId1, player1, DEPOSIT_AMOUNT);

        // Try second settlement
        vm.prank(settler);
        vm.expectRevert(MoltPokerVault.AlreadySettled.selector);
        vault.settlePayout(tableId, agentId1, player1, DEPOSIT_AMOUNT);
    }

    function testBatchSettleRefunds() public {
        // Setup: two players deposit
        vm.startPrank(player1);
        usdc.approve(address(vault), DEPOSIT_AMOUNT);
        vault.deposit(tableId, agentId1, DEPOSIT_AMOUNT);
        vm.stopPrank();

        vm.startPrank(player2);
        usdc.approve(address(vault), DEPOSIT_AMOUNT);
        vault.deposit(tableId, agentId2, DEPOSIT_AMOUNT);
        vm.stopPrank();

        // Batch refund
        bytes32[] memory tableIds = new bytes32[](2);
        bytes32[] memory agentIds = new bytes32[](2);
        address[] memory recipients = new address[](2);
        uint256[] memory amounts = new uint256[](2);

        tableIds[0] = tableId;
        tableIds[1] = tableId;
        agentIds[0] = agentId1;
        agentIds[1] = agentId2;
        recipients[0] = player1;
        recipients[1] = player2;
        amounts[0] = DEPOSIT_AMOUNT;
        amounts[1] = DEPOSIT_AMOUNT;

        vm.prank(settler);
        vault.batchSettleRefunds(tableIds, agentIds, recipients, amounts);

        // Check balances
        assertEq(usdc.balanceOf(player1), 100 * 10**6);
        assertEq(usdc.balanceOf(player2), 100 * 10**6);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function testPauseUnpause() public {
        // Grant pauser role to admin
        bytes32 pauserRole = vault.PAUSER_ROLE();
        vm.prank(admin);
        vault.grantRole(pauserRole, admin);

        // Pause
        vm.prank(admin);
        vault.pause();
        assertTrue(vault.paused());

        // Try to deposit while paused
        vm.prank(player1);
        usdc.approve(address(vault), DEPOSIT_AMOUNT);

        vm.prank(player1);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(tableId, agentId1, DEPOSIT_AMOUNT);

        // Unpause
        vm.prank(admin);
        vault.unpause();
        assertFalse(vault.paused());

        // Deposit should work now
        vm.prank(player1);
        vault.deposit(tableId, agentId1, DEPOSIT_AMOUNT);
        assertEq(usdc.balanceOf(address(vault)), DEPOSIT_AMOUNT);
    }

    function testRoleManagement() public {
        address newSettler = address(0x999);
        bytes32 settlerRole = vault.SETTLER_ROLE();

        // Only admin can grant roles
        vm.prank(settler);
        vm.expectRevert(MoltPokerVault.UnauthorizedAccess.selector);
        vault.grantRole(settlerRole, newSettler);

        // Admin grants role
        vm.prank(admin);
        vault.grantRole(settlerRole, newSettler);
        assertTrue(vault.hasRole(settlerRole, newSettler));

        // Admin revokes role
        vm.prank(admin);
        vault.revokeRole(settlerRole, newSettler);
        assertFalse(vault.hasRole(settlerRole, newSettler));
    }
}
