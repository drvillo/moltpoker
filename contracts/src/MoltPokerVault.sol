// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";
import {Pausable} from "./utils/Pausable.sol";

/**
 * @title MoltPokerVault
 * @notice Vault contract for MoltPoker real money tables
 * @dev Manages USDC deposits and payouts for poker games
 */
contract MoltPokerVault is ReentrancyGuard, Pausable {
    /// @notice USDC token address (immutable after deployment)
    IERC20 public immutable usdc;

    /// @notice Role for default admin operations
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    /// @notice Role for settling payouts and refunds
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    /// @notice Role for pausing/unpausing the contract
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Mapping of role => address => has role
    mapping(bytes32 => mapping(address => bool)) private _roles;

    /// @notice Track settled table+agent pairs to prevent double settlement
    mapping(bytes32 => mapping(bytes32 => bool)) private _settled;

    /// @notice Emitted when a deposit is received
    event DepositReceived(
        bytes32 indexed tableId,
        bytes32 indexed agentId,
        address indexed depositor,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when a payout is settled
    event TablePayoutSettled(
        bytes32 indexed tableId,
        bytes32 indexed agentId,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when a refund is settled
    event TableRefundSettled(
        bytes32 indexed tableId,
        bytes32 indexed agentId,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when the vault is paused
    event VaultPaused(address indexed account);

    /// @notice Emitted when the vault is unpaused
    event VaultUnpaused(address indexed account);

    /// @notice Emitted when a role is granted
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);

    /// @notice Emitted when a role is revoked
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    error UnauthorizedAccess();
    error AlreadySettled();
    error TransferFailed();
    error ZeroAmount();
    error ZeroAddress();

    modifier onlyRole(bytes32 role) {
        if (!hasRole(role, msg.sender)) revert UnauthorizedAccess();
        _;
    }

    constructor(address _usdc, address _admin) {
        if (_usdc == address(0) || _admin == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(SETTLER_ROLE, _admin);
    }

    /**
     * @notice Deposit USDC for a table game
     * @param tableId Canonical table identifier (keccak256("table:{id}"))
     * @param agentId Canonical agent identifier (keccak256("agent:{id}"))
     * @param amount Amount of USDC to deposit (in token units, 6 decimals)
     */
    function deposit(
        bytes32 tableId,
        bytes32 agentId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        // Transfer USDC from depositor to vault
        bool success = usdc.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        emit DepositReceived(tableId, agentId, msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Settle payout for a table winner
     * @param tableId Canonical table identifier
     * @param agentId Canonical agent identifier
     * @param recipient Address to receive the payout
     * @param amount Amount of USDC to pay out (in token units)
     */
    function settlePayout(
        bytes32 tableId,
        bytes32 agentId,
        address recipient,
        uint256 amount
    ) external nonReentrant whenNotPaused onlyRole(SETTLER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (_settled[tableId][agentId]) revert AlreadySettled();

        _settled[tableId][agentId] = true;

        // Transfer USDC from vault to recipient
        bool success = usdc.transfer(recipient, amount);
        if (!success) revert TransferFailed();

        emit TablePayoutSettled(tableId, agentId, recipient, amount, block.timestamp);
    }

    /**
     * @notice Settle refund for a table participant
     * @param tableId Canonical table identifier
     * @param agentId Canonical agent identifier
     * @param recipient Address to receive the refund
     * @param amount Amount of USDC to refund (in token units)
     */
    function settleRefund(
        bytes32 tableId,
        bytes32 agentId,
        address recipient,
        uint256 amount
    ) external nonReentrant whenNotPaused onlyRole(SETTLER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (_settled[tableId][agentId]) revert AlreadySettled();

        _settled[tableId][agentId] = true;

        // Transfer USDC from vault to recipient
        bool success = usdc.transfer(recipient, amount);
        if (!success) revert TransferFailed();

        emit TableRefundSettled(tableId, agentId, recipient, amount, block.timestamp);
    }

    /**
     * @notice Batch settle refunds for multiple participants
     * @param tableIds Array of table identifiers
     * @param agentIds Array of agent identifiers
     * @param recipients Array of recipient addresses
     * @param amounts Array of refund amounts
     */
    function batchSettleRefunds(
        bytes32[] calldata tableIds,
        bytes32[] calldata agentIds,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external nonReentrant whenNotPaused onlyRole(SETTLER_ROLE) {
        uint256 length = tableIds.length;
        require(
            length == agentIds.length &&
            length == recipients.length &&
            length == amounts.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < length; i++) {
            if (amounts[i] == 0) revert ZeroAmount();
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (_settled[tableIds[i]][agentIds[i]]) revert AlreadySettled();

            _settled[tableIds[i]][agentIds[i]] = true;

            bool success = usdc.transfer(recipients[i], amounts[i]);
            if (!success) revert TransferFailed();

            emit TableRefundSettled(tableIds[i], agentIds[i], recipients[i], amounts[i], block.timestamp);
        }
    }

    /**
     * @notice Check if a table+agent pair has been settled
     */
    function isSettled(bytes32 tableId, bytes32 agentId) external view returns (bool) {
        return _settled[tableId][agentId];
    }

    /**
     * @notice Pause the vault (emergency only)
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
        emit VaultPaused(msg.sender);
    }

    /**
     * @notice Unpause the vault
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
        emit VaultUnpaused(msg.sender);
    }

    /**
     * @notice Grant a role to an account
     */
    function grantRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(role, account);
    }

    /**
     * @notice Revoke a role from an account
     */
    function revokeRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(role, account);
    }

    /**
     * @notice Check if an account has a role
     */
    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }

    function _grantRole(bytes32 role, address account) private {
        if (!_roles[role][account]) {
            _roles[role][account] = true;
            emit RoleGranted(role, account, msg.sender);
        }
    }

    function _revokeRole(bytes32 role, address account) private {
        if (_roles[role][account]) {
            _roles[role][account] = false;
            emit RoleRevoked(role, account, msg.sender);
        }
    }
}
