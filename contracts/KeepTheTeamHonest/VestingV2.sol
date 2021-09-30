// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {iGovernance} from "../interfaces/iGovernance.sol";

contract VestingV2 is Ownable {
    mapping(address => uint256) public GFIbalance;
    mapping(address => uint256) public withdrawableFee;
    uint256 callersShare = 100; //Caller of update fee get 1/100 of the collected fee
    address[] public users;
    uint256 public userCount;
    uint256 public totalBalance;
    uint256 public lastFeeUpdate; // Timestamp for when updateWithdrawableFee() was last called
    uint256[10] public subVestingPeriodTimeStamp; //Time stamps for when coins will become available
    mapping(address => bool[10]) public subVestingPeriodClaimed; //Bool indicating whether the user already claimed that periods funds
    mapping(address => uint) public periodAmount;
    IERC20 GFI;
    IERC20 WETH;
    iGovernance Governor;
    address public GOVERANCE_ADDRESS;
    uint256 public LockStart;
    uint256 public LockEnd;
    bool public stopFeeCollection;

    constructor(
        address GFI_ADDRESS,
        address WETH_ADDRESS,
        address _GOVERNANCE_ADDRESS,
        uint256 startTimeStamp,
        uint256 subPeriodTime
    ) {
        GFI = IERC20(GFI_ADDRESS);
        WETH = IERC20(WETH_ADDRESS);
        GOVERANCE_ADDRESS = _GOVERNANCE_ADDRESS;
        Governor = iGovernance(GOVERANCE_ADDRESS);
        LockStart = startTimeStamp;
        LockEnd = LockStart + (subPeriodTime * 10); //10 months from start
        uint time = LockStart + subPeriodTime;
        for ( uint i=0; i < 10; i++){
            subVestingPeriodTimeStamp[i] = time;
            time = time + subPeriodTime;
        }
    }

    function setGovenorAddress(address _address) external onlyOwner {
        GOVERANCE_ADDRESS = _address;
        Governor = iGovernance(GOVERANCE_ADDRESS);
    }

    function setFeeCollectionBool(bool _bool) external onlyOwner {
        stopFeeCollection = _bool;
    }

    function getLastFeeUpdate() external view returns (uint256) {
        return lastFeeUpdate;
    }

    function setCallersShare(uint256 _share) external onlyOwner{
        callersShare = _share;
    }

    /** @dev Allows owner to add new allowances for users
     * Address must not have an existing GFIbalance
     */
    function addUser(address _address, uint256 bal) external onlyOwner {
        require(GFIbalance[_address] == 0, "User is already in the contract!");
        require(
            GFI.transferFrom(msg.sender, address(this), bal),
            "GFI transferFrom failed!"
        );
        GFIbalance[_address] = bal;
        users.push(_address);
        userCount++;
        totalBalance = totalBalance + bal;
        periodAmount[_address] = bal / 100;
        periodAmount[_address] = periodAmount[_address] * 10; // Zero out the last decimal
    }

    function updateWithdrawableFee() external{
        require(stopFeeCollection, "Fee distribution has been turned off!");
        uint256 collectedFee = Governor.claimFee();
        uint256 callersFee = collectedFee / callersShare;
        collectedFee = collectedFee - callersFee;
        uint256 userShare;
        for (uint256 i = 0; i < userCount; i++) {
            userShare = (collectedFee * GFIbalance[users[i]]) / totalBalance;
            //Remove last digit of userShare
            userShare = userShare / 10;
            userShare = userShare * 10;
            withdrawableFee[users[i]] = withdrawableFee[users[i]] + userShare;
        }
        lastFeeUpdate = block.timestamp;
        require(
            WETH.transfer(msg.sender, callersFee),
            "Failed to transfer callers fee to caller!"
        );
    }

    function collectFee() external {
        require(stopFeeCollection, "Fee distribution has been turned off!");
        require(withdrawableFee[msg.sender] > 0, "Caller has no fee to claim!");
        uint256 tmpBal = withdrawableFee[msg.sender];
        withdrawableFee[msg.sender] = 0;
        require(WETH.transfer(msg.sender, tmpBal));
    }

    function claimGFI() external {
        require(GFIbalance[msg.sender] > 0, "Caller has no GFI to claim!");
        //If GFI is fully vested, then just send remaining balance to user
        if ( block.timestamp > LockEnd){
        uint256 tmpBal = GFIbalance[msg.sender];
        GFIbalance[msg.sender] = 0;
        totalBalance = totalBalance - tmpBal;
        require(
            GFI.transfer(msg.sender, tmpBal),
            "Failed to transfer GFI to caller!"
        );
        }
        else {
            uint i;
            while(block.timestamp > subVestingPeriodTimeStamp[i]){
                if(!subVestingPeriodClaimed[msg.sender][i]){
                    subVestingPeriodClaimed[msg.sender][i] = true;
                    GFIbalance[msg.sender] = GFIbalance[msg.sender] - periodAmount[msg.sender];
                    totalBalance = totalBalance - periodAmount[msg.sender];
                    require(GFI.transfer(msg.sender, periodAmount[msg.sender]));
                }
                i++;
            }
        }
    }

    function withdrawAll() external onlyOwner {
        require(block.timestamp > (LockEnd + 2592000), "Locking Period is not over yet!"); // If users have not claimed GFI 1 month after lock is done, Owner can claim remaining GFI and WETH in contract
        require(
            WETH.transfer(
                msg.sender,
                WETH.balanceOf(address(this))
            ),
            "Failed to transfer WETH to Owner!"
        );
        require(
            GFI.transfer(
                msg.sender,
                GFI.balanceOf(address(this))
            ),
            "Failed to transfer leftover GFI to Owner!"
        );
    }
}