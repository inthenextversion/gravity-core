// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./ERC20SnapshotInitializable.sol";
import "../interfaces/ICompounderFactory.sol";
import "../interfaces/IFarmV2.sol";
import {UserInfo} from "../interfaces/IFarmV2.sol";
import {ShareInfo} from "../interfaces/ICompounderFactory.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Share is ERC20SnapshotInitializable {


    ICompounderFactory public CompounderFactory;
    //At the time of snapshot save these values so we can use them to evaluate shares worth later
    uint public shareToDepositToken;
    uint public depositTokenToGFI;

    function initialize() external initializer{
        CompounderFactory = ICompounderFactory(msg.sender);
        initializeERC20("Gravity Finance Farm Share", "GFI-FS");
    }

    modifier onlyFactory() {
        require(msg.sender == address(CompounderFactory), "Caller is not Compounder Factory");
        _;
    }

    modifier onlyTierManager() {
        require(msg.sender == CompounderFactory.tierManager(), "Caller is not Tier Manager");
        _;
    }

    function mint(address to, uint _amount) external onlyFactory returns(bool){
        _mint(to, _amount);
        return true;
    }

    function burn(address from, uint _amount) external onlyFactory returns(bool){
        _burn(from, _amount);
        return true;
    }

    function takeSnapshot() external onlyTierManager{
        _snapshot();

        //record shareToDepositToken evaluation
        address farm = CompounderFactory.getFarm(address(this));
        UserInfo memory stats = IFarmV2(farm).userInfo(address(CompounderFactory));
        shareToDepositToken = (10 ** decimals()) * stats.amount/totalSupply(); 

        //record depositTokenToGFI evaluation
        ShareInfo memory shareStats = CompounderFactory.farmAddressToShareInfo(farm);
        if(CompounderFactory.gfi()  == shareStats.depositToken){
            depositTokenToGFI = (10 ** decimals());
        }
        else if(shareStats.lpFarm){
            address pair = IUniswapV2Factory(CompounderFactory.swapFactory()).getPair(shareStats.lpA, shareStats.lpB);
            uint GFIinPair = IERC20(CompounderFactory.gfi()).balanceOf(pair);
            depositTokenToGFI = ( (10 ** decimals()) * GFIinPair ) / IUniswapV2Pair(pair).totalSupply();
        }
        else{
            depositTokenToGFI = 0; //deposit token is not an Lp token or GFI so there is no conversion
        }

    }

    function getSharesGFIWorthAtLastSnapshot(address _address) view external returns(uint shareValuation){
        //grab the amount of shares _address had at last snapshot, then use  shareToDepositToken, and depositTokenToGFI
        //to calculate GFI worth
        uint userSnapshotBalance = balanceOfAt(_address, _getCurrentSnapshotId());
        shareValuation = ( ( (userSnapshotBalance * shareToDepositToken) / (10 ** decimals()) ) * depositTokenToGFI ) / (10 ** decimals());
    } 

    function getSharesGFICurrentWorth(address _address) view external returns(uint shareValuation){
        //record shareToDepositToken evaluation
        address farm = CompounderFactory.getFarm(address(this));
        UserInfo memory stats = IFarmV2(farm).userInfo(address(CompounderFactory));
        uint tmpshareToDepositToken = ( (10 ** decimals()) * stats.amount ) / totalSupply(); 

        //record depositTokenToGFI evaluation
        uint tmpdepositTokenToGFI;
        ShareInfo memory shareStats = CompounderFactory.farmAddressToShareInfo(farm);
        if(CompounderFactory.gfi()  == shareStats.depositToken){
            tmpdepositTokenToGFI = (10 ** decimals());
        }
        else if(shareStats.lpFarm){
            address pair = IUniswapV2Factory(CompounderFactory.swapFactory()).getPair(shareStats.lpA, shareStats.lpB);
            uint GFIinPair = IERC20(CompounderFactory.gfi()).balanceOf(pair);
            tmpdepositTokenToGFI = ( (10 ** decimals()) * GFIinPair ) / IUniswapV2Pair(pair).totalSupply();
        }
        else{
            tmpdepositTokenToGFI = 0; //deposit token is not an Lp token or GFI so there is no conversion
        }

        shareValuation = ( ( (balanceOf(_address) * tmpshareToDepositToken) / (10 ** decimals()) ) * tmpdepositTokenToGFI ) / (10 ** decimals());
    }

    function viewCurrentSnapshotID() external view returns(uint ID){
        ID = _getCurrentSnapshotId();
    }

}