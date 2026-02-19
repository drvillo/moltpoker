// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../lib/forge-std/src/Script.sol";
import "../src/MoltPokerVault.sol";
import "../src/mocks/MockUSDC.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying from:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // For local/test networks, deploy mock USDC
        address usdcAddress;
        if (block.chainid == 31337) {
            // Local anvil
            MockUSDC usdc = new MockUSDC();
            usdcAddress = address(usdc);
            console.log("MockUSDC deployed at:", usdcAddress);
        } else if (block.chainid == 8453) {
            // Base mainnet
            usdcAddress = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
            console.log("Using Base mainnet USDC:", usdcAddress);
        } else if (block.chainid == 84532) {
            // Base Sepolia
            usdcAddress = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
            console.log("Using Base Sepolia USDC:", usdcAddress);
        } else {
            revert("Unsupported chain");
        }

        // Deploy Vault
        MoltPokerVault vault = new MoltPokerVault(usdcAddress, deployer);
        console.log("MoltPokerVault deployed at:", address(vault));

        vm.stopBroadcast();

        // Log deployment info
        console.log("\n=== Deployment Complete ===");
        console.log("Chain ID:", block.chainid);
        console.log("USDC Address:", usdcAddress);
        console.log("Vault Address:", address(vault));
        console.log("Admin Address:", deployer);
    }
}
