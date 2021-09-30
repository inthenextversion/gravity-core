// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {iGravityToken} from "../interfaces/iGravityToken.sol";

contract Governance is Initializable, OwnableUpgradeable {
    mapping(address => uint256) public feeBalance;
    address public tokenAddress;
    struct FeeLedger {
        uint256 totalFeeCollected_LastClaim;
        uint256 totalSupply_LastClaim;
        uint256 userBalance_LastClaim;
    }
    mapping(address => FeeLedger) public feeLedger;

    mapping(address => uint[3]) public tierLedger;
    uint[3] public Tiers;
    uint256 public totalFeeCollected;
    iGravityToken GFI;
    IERC20 WETH;
    IERC20 WBTC;

    /**
    * @dev emitted when Fees are deposited into the Governance contract
    * @param weth the amount of wETH deposited into the governance contract
    * @param wbtc the amount of wBTC deposited into the governance contract
    **/
    event FeeDeposited(uint weth, uint wbtc);

    /**
    * @dev emitted when a wETH fee is claimed
    * @param claimer the address that had it's fees claimed
    * @param recipient the address the fees were sent to
    * @param amount the amount of wETH sent to the recipient
    **/
    event FeeClaimed(address claimer, address recipient, uint amount);

    /**
    * @dev emitted when GFI is burned for wBTC
    * @param claimer the address burning GFI for wBTC
    * @param GFIamount the amount of GFI burned
    * @param WBTCamount the amount of wBTC sent to claimer
    **/
    event WbtcClaimed(address claimer, uint GFIamount, uint WBTCamount);

    /**
    * @dev used to ensure only token contract can call govAuth functions lines 233 -> 268
    **/
    modifier onlyToken() {
        require(msg.sender == tokenAddress, "Only the token contract can call this function");
        _;
    }

    function initialize(
        address GFI_ADDRESS,
        address WETH_ADDRESS,
        address WBTC_ADDRESS
    ) public initializer {
        __Ownable_init();
        tokenAddress = GFI_ADDRESS;
        GFI = iGravityToken(GFI_ADDRESS);
        WETH = IERC20(WETH_ADDRESS);
        WBTC = IERC20(WBTC_ADDRESS);
    }

    function pendingEarnings(address _address) public view returns (uint256) {
        uint256 supply;
        uint256 balance;

        //Pick the greatest supply and the lowest user balance
        uint256 currentBalance = GFI.balanceOf(_address);
        if (currentBalance > feeLedger[_address].userBalance_LastClaim) {
            balance = feeLedger[_address].userBalance_LastClaim;
        } else {
            balance = currentBalance;
        }

        uint256 currentSupply = GFI.totalSupply();
        if (currentSupply < feeLedger[_address].totalSupply_LastClaim) {
            supply = feeLedger[_address].totalSupply_LastClaim;
        } else {
            supply = currentSupply;
        }

        uint256 feeAllocation =
            ((totalFeeCollected -
                feeLedger[_address].totalFeeCollected_LastClaim) * balance) /
                supply;
        //Add any extra fees they need to collect
        feeAllocation = feeAllocation + feeBalance[_address];
        return feeAllocation;
    }

    function viewBacking(uint amount) external view returns(uint backing){
        require(
            amount > 10**18,
            "Amount too small, must be greater than 1 GFI token!"
        );
        backing =
            (amount * WBTC.balanceOf(address(this))) / GFI.totalSupply();
    }

    function updateTiers(uint tier3, uint tier2, uint tier1) external onlyOwner{
        require(tier3 > tier2 && tier2 > tier1, 'Gravity Finance: Invalid Tier assignments');
        Tiers[0] = tier1;
        Tiers[1] = tier2;
        Tiers[2] = tier3;
    }

    /**
    * @dev internal function called when token contract calls govAuthTransfer or govAuthTransferFrom
    * Will update the recievers fee balance. This will not change the reward they would have got from this fee update
    * rather it updates the fee ledger to refelct the new increased amount of GFI in their wallet
    * @param _address the address of the address recieving GFI tokens
    * @param amount the amount of tokens the address is recieving
    * @return amount of wETH added to _address fee balance
    **/
    function _updateFeeReceiver(address _address, uint256 amount)
        internal
        returns (uint256)
    {
        uint256 supply;
        uint256 balance;

        //Pick the greatest supply and the lowest user balance
        uint256 currentBalance = GFI.balanceOf(_address) + amount; //Add the amount they are getting transferred eventhough updateFee will use smaller pre transfer value
        if (currentBalance > feeLedger[_address].userBalance_LastClaim) {
            balance = feeLedger[_address].userBalance_LastClaim;
        } else {
            balance = currentBalance;
        }

        uint256 currentSupply = GFI.totalSupply();
        if (currentSupply < feeLedger[_address].totalSupply_LastClaim) {
            supply = feeLedger[_address].totalSupply_LastClaim;
        } else {
            supply = currentSupply;
        }

        uint256 feeAllocation =
            ((totalFeeCollected -
                feeLedger[_address].totalFeeCollected_LastClaim) * balance) /
                supply;
        feeLedger[_address].totalFeeCollected_LastClaim = totalFeeCollected;
        feeLedger[_address].totalSupply_LastClaim = currentSupply;
        feeLedger[_address].userBalance_LastClaim = currentBalance;
        feeBalance[_address] = feeBalance[_address] + feeAllocation;
        return feeAllocation;
    }
    /**
    * @dev updates the fee ledger info for the specified address
    * This function can be used to update the fee ledger info for any address, and is used to update the fee for the from address in transfer and transferFrom calls
    * @param _address the address you want to update the fee ledger info for
    * @return the amount of wETH added to _address feeBalance
    **/
    function updateFee(address _address) public returns (uint256) {
        require(GFI.balanceOf(_address) > 0, "_address has no GFI");
        uint256 supply;
        uint256 balance;

        //Pick the greatest supply and the lowest user balance
        uint256 currentBalance = GFI.balanceOf(_address);
        if (currentBalance > feeLedger[_address].userBalance_LastClaim) {
            balance = feeLedger[_address].userBalance_LastClaim;
        } else {
            balance = currentBalance;
        }

        uint256 currentSupply = GFI.totalSupply();
        if (currentSupply < feeLedger[_address].totalSupply_LastClaim) {
            supply = feeLedger[_address].totalSupply_LastClaim;
        } else {
            supply = currentSupply;
        }

        uint256 feeAllocation =
            ((totalFeeCollected -
                feeLedger[_address].totalFeeCollected_LastClaim) * balance) /
                supply;
        feeLedger[_address].totalFeeCollected_LastClaim = totalFeeCollected;
        feeLedger[_address].totalSupply_LastClaim = currentSupply;
        feeLedger[_address].userBalance_LastClaim = currentBalance;
        feeBalance[_address] = feeBalance[_address] + feeAllocation;
        return feeAllocation;
    }

    /**
    * @dev updates callers fee ledger, and pays out any fee owed to caller
    * @return the amount of wETH sent to caller
    **/
    function claimFee() public returns (uint256) {
        require(GFI.balanceOf(msg.sender) > 0, "User has no GFI");
        uint256 supply;
        uint256 balance;

        //Pick the greatest supply and the lowest user balance
        uint256 currentBalance = GFI.balanceOf(msg.sender);
        if (currentBalance > feeLedger[msg.sender].userBalance_LastClaim) {
            balance = feeLedger[msg.sender].userBalance_LastClaim;
        } else {
            balance = currentBalance;
        }

        uint256 currentSupply = GFI.totalSupply();
        if (currentSupply < feeLedger[msg.sender].totalSupply_LastClaim) {
            supply = feeLedger[msg.sender].totalSupply_LastClaim;
        } else {
            supply = currentSupply;
        }

        uint256 feeAllocation =
            ((totalFeeCollected -
                feeLedger[msg.sender].totalFeeCollected_LastClaim) * balance) /
                supply;
        feeLedger[msg.sender].totalFeeCollected_LastClaim = totalFeeCollected;
        feeLedger[msg.sender].totalSupply_LastClaim = currentSupply;
        feeLedger[msg.sender].userBalance_LastClaim = currentBalance;
        //Add any extra fees they need to collect
        feeAllocation = feeAllocation + feeBalance[msg.sender];
        feeBalance[msg.sender] = 0;
        require(WETH.transfer(msg.sender, feeAllocation),"Failed to delegate wETH to caller");
        emit FeeClaimed(msg.sender, msg.sender, feeAllocation);
        return feeAllocation;
    }

    /**
    * @dev updates callers fee ledger, and pays out any fee owed to caller to the reciever address
    * @param reciever the address to send callers fee balance to
    * @return the amount of wETH sent to reciever
    **/
    function delegateFee(address reciever) public returns (uint256) {
        require(GFI.balanceOf(msg.sender) > 0, "User has no GFI");
        uint256 supply;
        uint256 balance;

        //Pick the greatest supply and the lowest user balance
        uint256 currentBalance = GFI.balanceOf(msg.sender);
        if (currentBalance > feeLedger[msg.sender].userBalance_LastClaim) {
            balance = feeLedger[msg.sender].userBalance_LastClaim;
        } else {
            balance = currentBalance;
        }

        uint256 currentSupply = GFI.totalSupply();
        if (currentSupply < feeLedger[msg.sender].totalSupply_LastClaim) {
            supply = feeLedger[msg.sender].totalSupply_LastClaim;
        } else {
            supply = currentSupply;
        }

        uint256 feeAllocation =
            ((totalFeeCollected -
                feeLedger[msg.sender].totalFeeCollected_LastClaim) * balance) /
                supply;
        feeLedger[msg.sender].totalFeeCollected_LastClaim = totalFeeCollected;
        feeLedger[msg.sender].totalSupply_LastClaim = currentSupply;
        feeLedger[msg.sender].userBalance_LastClaim = currentBalance;
        //Add any extra fees they need to collect
        feeAllocation = feeAllocation + feeBalance[msg.sender];
        feeBalance[msg.sender] = 0;
        require(WETH.transfer(reciever, feeAllocation), "Failed to delegate wETH to reciever");
        emit FeeClaimed(msg.sender, reciever, feeAllocation);
        return feeAllocation;
    }

    /**
    * @dev withdraws callers fee balance without updating fee ledger
    **/
    function withdrawFee() external {
        uint256 feeAllocation = feeBalance[msg.sender];
        feeBalance[msg.sender] = 0;
        require(WETH.transfer(msg.sender, feeAllocation), "Failed to delegate wETH to caller");
        emit FeeClaimed(msg.sender, msg.sender, feeAllocation);
    }

    /**
    * @dev update from and to address tier based on the amount.
    **/
    function _updateUsersTiers(address from, address to, uint amount) internal{
        uint fromNewBal = GFI.balanceOf(from) - amount;
        uint toNewBal = GFI.balanceOf(to) + amount;
        for (uint i = 0; i<3; i++){
            if(fromNewBal >= Tiers[i]){
                if(tierLedger[from][i] == 0){
                    tierLedger[from][i] = block.timestamp;
                }
            }
            else{
                tierLedger[from][i] = 0;
            }

            if(toNewBal >= Tiers[i]){
                if(tierLedger[to][i] == 0){
                    tierLedger[to][i] = block.timestamp;
                }
            }
            else{
                tierLedger[to][i] = 0;
            }
        }
    }

    /**
    * @dev when governance forwarding is enabled in the token contract, this function is called when users call transfer
    * @param caller address that originally called transfer
    * @param to address to transfer tokens to
    * @param amount the amount of tokens to transfer
    **/
    function govAuthTransfer(
        address caller,
        address to,
        uint256 amount
    ) external onlyToken returns (bool) {
        require(GFI.balanceOf(caller) >= amount, "GOVERNANCE: Amount exceedes balance!");
        require(caller != to, "Gravity Finance: Forbidden");
        updateFee(caller);
        _updateFeeReceiver(to, amount);
        _updateUsersTiers(caller, to, amount);
        return true;
    }

    /**
    * @dev when governance forwarding is enabled in the token contract, this function is called when users call transferFrom
    * @param caller address that originally called transferFrom used to check if caller is allowed to spend from's tokens
    * @param from address to transfer tokens from
    * @param to address to transfer tokens to
    * @param amount the amount of tokens to transfer
    **/
    function govAuthTransferFrom(
        address caller,
        address from,
        address to,
        uint256 amount
    ) external onlyToken returns (bool) {
        require(GFI.allowance(from, caller) >= amount, "GOVERNANCE: Amount exceedes allowance!");
        require(GFI.balanceOf(from) >= amount, "GOVERNANCE: Amount exceedes balance!");
        require(from != to, "Gravity Finance: Forbidden");
        updateFee(from);
        _updateFeeReceiver(to, amount);
        _updateUsersTiers(from, to, amount);
        return true;
    }

    /**
    * @dev used to deposit wETH fees into the contract
    * @param amountWETH the amount of wETH to be sent into the governance contract
    * @param amountWBTC the amount of wBTC to be sent into the governance contract
    **/
    function depositFee(uint256 amountWETH, uint256 amountWBTC) external {
        require(
            WETH.transferFrom(msg.sender, address(this), amountWETH),
            "Failed to transfer wETH into contract!"
        );
        require(
            WBTC.transferFrom(msg.sender, address(this), amountWBTC),
            "Failed to transfer wBTC into contract!"
        );
        totalFeeCollected = totalFeeCollected + amountWETH;
        emit FeeDeposited(amountWETH, amountWBTC);
    }

    /**
    * @dev used to burn GFI and convert it into wBTC
    * @param amount the amount of GFI to burn
    **/
    function claimBTC(uint256 amount) external {
        require(
            amount > 10**18,
            "Amount too small, must be greater than 1 GFI token!"
        );
        require(
            GFI.transferFrom(msg.sender, address(this), amount),
            "Failed to transfer GFI to governance contract!"
        );
        uint256 WBTCowed =
            (amount * WBTC.balanceOf(address(this))) / GFI.totalSupply();
        require(GFI.burn(amount), "Failed to burn GFI!");
        require(
            WBTC.transfer(msg.sender, WBTCowed),
            "Failed to transfer wBTC to caller!"
        );
        emit WbtcClaimed(msg.sender, amount, WBTCowed);
    }
}
