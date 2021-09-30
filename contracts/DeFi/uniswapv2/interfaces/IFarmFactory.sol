// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IFarmFactory {
    /**
     * Assume claimFee uses msg.sender, and returns the amount of WETH sent to the caller
     */
    function getFarm(address depositToken, address rewardToken, uint version) external view returns (address farm);
    function getFarmIndex(address depositToken, address rewardToken) external view returns (uint fID);

    function whitelist(address _address) external view returns (bool);
    function governance() external view returns (address);
    function incinerator() external view returns (address);
    function harvestFee() external view returns (uint);
    function gfi() external view returns (address);
    function feeManager() external view returns (address);
    function allFarms(uint fid) external view returns (address); 
}