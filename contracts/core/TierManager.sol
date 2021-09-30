// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/IShare.sol";
import "../interfaces/iGovernance.sol";
import "../interfaces/ICompounderFactory.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ShareInfo} from "../interfaces/ICompounderFactory.sol";

contract TierManager is Ownable {
    address[] public supportedShareTokens;
    IERC20 GFI;
    iGovernance Governor;
    ICompounderFactory Factory;
    constructor(){
        supportedShareTokens.push(0xBcCd20990CeFD07f725409F80a41648126aBefC7);//GFI
        supportedShareTokens.push(0xfa37d42f497e0890315645a4650439471Ede1C50);//WMATIC-GFI
        supportedShareTokens.push(0xA4F39A2c5D7b0437df06fF6f434f20b012673A34);//WBTC-GFI
        supportedShareTokens.push(0xdBF9047AdF8A5147028A47Cf95922277C43e5C55);//USDC-GFI
        supportedShareTokens.push(0x6e6D10584f078210D199873A54Ac31da9bC3Decf);//WETH-GFI
        GFI = IERC20(0x874e178A2f3f3F9d34db862453Cd756E7eAb0381);
        Governor = iGovernance(0xEe5578a3Bab33F7A56575785bb4846B90Be37d50);
        Factory = ICompounderFactory(0xDc15F68E5F80ACD5966c84f518B1504A7E1772CA);

    }

    function updateSupportedShareTokens(address shareToken, uint index) external onlyOwner{
        if(index < supportedShareTokens.length){
            supportedShareTokens[index] = shareToken;
        }
        else{
            supportedShareTokens.push(shareToken);
        }
    }

    function takeSnapshotOfAllSupportedShareTokens() external onlyOwner{
        for(uint i=0; i<supportedShareTokens.length; i++){
            IShare(supportedShareTokens[i]).takeSnapshot();
        }
    }

    /*
     * @dev returns the highest tier the caller address has, based off current GFI and share holdings
     */
    function checkTier(address caller) external view returns(uint){
        uint bigBal = GFI.balanceOf(caller);
        uint userLPBal;
        ShareInfo memory info;
        for(uint i=0; i<supportedShareTokens.length; i++){
            bigBal += IShare(supportedShareTokens[i]).getSharesGFICurrentWorth(caller);
            info = Factory.farmAddressToShareInfo(Factory.getFarm(supportedShareTokens[i]));
            userLPBal = IERC20(info.depositToken).balanceOf(caller);
            bigBal += userLPBal * GFI.balanceOf(info.depositToken) / IERC20(info.depositToken).totalSupply();
        }
        for(uint i=3; i>0; i--){
            if(bigBal >= Governor.Tiers(i-1)){
                return i;
            }
        }
        return 0;
    }

    function viewAllGFIBalances(address caller) external view returns(uint[] memory){
        uint[] memory balances = new uint[](supportedShareTokens.length + 2);
        balances[0] = (GFI.balanceOf(caller));
        balances[1] = (GFI.balanceOf(caller));
        uint userLPBal;
        ShareInfo memory info;
        for(uint i=0; i<supportedShareTokens.length; i++){
            balances[i+2] = IShare(supportedShareTokens[i]).getSharesGFICurrentWorth(caller);
            balances[0] += IShare(supportedShareTokens[i]).getSharesGFICurrentWorth(caller);
            info = Factory.farmAddressToShareInfo(Factory.getFarm(supportedShareTokens[i]));
            userLPBal = IERC20(info.depositToken).balanceOf(caller);
            balances[i+2] += userLPBal * GFI.balanceOf(info.depositToken) / IERC20(info.depositToken).totalSupply();
            balances[0] += userLPBal * GFI.balanceOf(info.depositToken) / IERC20(info.depositToken).totalSupply();
        }
        return balances;
    }

    //for IDOs
    function checkTierIncludeSnapshot() external returns(uint){

    }

}