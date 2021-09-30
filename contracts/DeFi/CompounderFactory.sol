// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IFarmFactory} from "../interfaces/IFarmFactory.sol";
import "../interfaces/IFarmV2.sol";
import "./Share.sol";
import "../interfaces/IShare.sol";
import "../interfaces/iGravityToken.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Router02.sol";
import "../DeFi/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "../interfaces/ITierManager.sol";
import {UserInfo} from "../interfaces/IFarmV2.sol";
import {FarmInfo} from "../interfaces/IFarmV2.sol";
import {ShareInfo} from "../interfaces/ICompounderFactory.sol";//dont think this is needed
import "../interfaces/iGovernance.sol";
import "../interfaces/IIncinerator.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CompounderFactory is Ownable{
    mapping(address => ShareInfo) public farmAddressToShareInfo;
    iGravityToken GFI;
    IFarmFactory Factory;
    address public ShareTokenImplementation;
    mapping(address => address) public getShareToken;//input the farm address to get it's share token
    mapping(address => address) public getFarm;//input the share address to get it's farm
    address[] public allShareTokens;
    mapping(address => uint) public rewardBalance;
    mapping(address => uint) public lastHarvestDate;
    bool public useOptimizedReinvest = true;
    mapping(address => bool) public performBuyBacks;
    bool public txOriginOrWhitelist;
    address public buybacks;
    address public dustPan;
    address public feeManager;
    address public swapFactory;
    address public router;
    address public tierManager;
    address public gfi;
    uint public requiredTier;
    bool public checkTiers;
    address public governor;
    address public incinerator;
    mapping(address => bool) public whitelist;

    /**
    @dev emitted when a new compounder is created
    **/
    event CompounderCreated(address _farmAddress, uint requiredTier);

    /**
    * @dev emitted when owner changes the whitelist
    * @param _address the address that had its whitelist status changed
    * @param newBool the new state of the address
    **/
    event whiteListChanged(address _address, bool newBool);

    event TierManagerChanged(address newManager);

    event TierCheckingUpdated(bool newState);

    event GovernorChanged(address governor);

    event IncineratorChanged(address incinerator);

    event ShareInfoUpdated(address farmAddress, uint _minHarvest, uint _maxCallerReward, uint _callerFeePercent, uint _vaultFee);

    event SharedVariablesUpdated(address _dustPan, address _feeManager, address _swapFactory, address _router);

    event Compounded(address farmAddress, uint timestamp);

    event ChangeBuyBacksState(bool state);

    event ChangeBuyBacksAddress(address _address);

    event ChangeCompoundCaller(bool state);

    modifier compounderExists(address farmAddress){
        require(getShareToken[farmAddress] != address(0), "Compounder does not exist!");
        _;
    }

    modifier onlyWhitelist() {
        require(whitelist[msg.sender], "Caller is not in whitelist!");
        _;
    }

    constructor(address gfiAddress, address farmFactoryAddress, uint _requiredTier, address _tierManager) {
        GFI = iGravityToken(gfiAddress);
        gfi = gfiAddress;
        Factory = IFarmFactory(farmFactoryAddress);
        Share ShareTokenRoot = new Share();
        ShareTokenImplementation = address(ShareTokenRoot);
        requiredTier = _requiredTier;
        tierManager = _tierManager;
    }

    function setOptimizedReinvest(bool state) external onlyOwner{
        useOptimizedReinvest = state;
    }

    function setPerformBuyBacks(address farmAddress, bool state) external onlyOwner{
        performBuyBacks[farmAddress] = state;
        emit ChangeBuyBacksState(state);
    }

    function changeBuyBacks(address _address) external onlyOwner{
        buybacks = _address;
        emit ChangeBuyBacksAddress(_address);
    }

    function setTxOriginOrWhitelist(bool state) external onlyOwner{
        txOriginOrWhitelist = state;
        emit ChangeCompoundCaller(state);
    }

    function getShareWorthInDepositToken(address farmAddress, uint amount) external view returns(uint worth){
        IShare ShareToken = IShare(farmAddressToShareInfo[farmAddress].shareToken);
        IFarmV2 Farm = IFarmV2(farmAddress);
        worth = amount * Farm.userInfo(address(this)).amount/ShareToken.totalSupply();
    }

    function adjustWhitelist(address _address, bool _bool) external onlyOwner {
        whitelist[_address] = _bool;
        emit whiteListChanged(_address, _bool);
    }

    function changeTierManager(address _tierManager) external onlyOwner{
        tierManager = _tierManager;
        emit TierManagerChanged(tierManager);
    }

    function changeGovernor(address _governor) external onlyOwner{
        governor = _governor;
        emit GovernorChanged(governor);
    }

    function changeIncinerator(address _incinerator) external onlyOwner{
        incinerator = _incinerator;
        emit IncineratorChanged(incinerator);
    }
    
    function changeCheckTiers(bool _bool) external onlyOwner{
        checkTiers = _bool;
        emit TierCheckingUpdated(checkTiers);
    }

    function changeShareInfo(address farmAddress, uint _minHarvest, uint _maxCallerReward, uint _callerFeePercent, uint _vaultFee) external onlyOwner compounderExists(farmAddress){
        require(_callerFeePercent <= 10000, 'Gravity Finance: INVALID CALLER FEE PERCENT');
        require(_vaultFee <= 500, 'Gravity Finance: Vault Fee too high');

        farmAddressToShareInfo[farmAddress].vaultFee = _vaultFee;
        farmAddressToShareInfo[farmAddress].minHarvest = _minHarvest;
        farmAddressToShareInfo[farmAddress].maxCallerReward = _maxCallerReward;
        farmAddressToShareInfo[farmAddress].callerFeePercent = _callerFeePercent;
        emit ShareInfoUpdated(farmAddress, _minHarvest, _maxCallerReward, _callerFeePercent, _vaultFee);
    }

    function updateSharedVariables(address _dustPan, address _feeManager, address _swapFactory, address _router) external onlyOwner{
        dustPan = _dustPan;
        feeManager = _feeManager;
        swapFactory = _swapFactory;
        router = _router;
        emit SharedVariablesUpdated(_dustPan, _feeManager, _swapFactory, _router);
    }

    function createCompounder(address _farmAddress, address _depositToken, address _rewardToken, uint _vaultFee, uint _maxCallerReward, uint _callerFee, uint _minHarvest, bool _lpFarm, address _lpA, address _lpB) external onlyWhitelist{
        if(_lpFarm && _rewardToken != _lpA){
            require(IUniswapV2Factory(swapFactory).getPair(_rewardToken, _lpA) != address(0), "Reward token must have a swap pair with lpA if they are not the same");
        }
        require(getShareToken[_farmAddress] == address(0), "Share token already exists!");
        require(_callerFee <= 10000, 'Gravity Finance: INVALID CALLER FEE PERCENT');
        require(_vaultFee <= 500, 'Gravity Finance: Vault Fee too high');

        //Create the clone proxy, and add it to the getFarm mappping, and allFarms array
        bytes32 salt = keccak256(abi.encodePacked(_farmAddress));
        address shareClone = Clones.cloneDeterministic(ShareTokenImplementation, salt);
        getShareToken[_farmAddress] = shareClone;
        getFarm[shareClone] = _farmAddress;
        allShareTokens.push(shareClone);
        farmAddressToShareInfo[_farmAddress] = ShareInfo({
            depositToken: _depositToken,
            rewardToken: _rewardToken,
            shareToken: shareClone,
            vaultFee: _vaultFee,
            minHarvest: _minHarvest,
            maxCallerReward: _maxCallerReward,
            callerFeePercent: _callerFee,
            lpFarm: _lpFarm,
            lpA: _lpA,
            lpB: _lpB
        });
        IShare(shareClone).initialize();
        emit CompounderCreated(_farmAddress, requiredTier);
    }

    /**
    * @dev allows caller to deposit the depositToken corresponding to the given fid. 
    * In return caller is minted Shares for that farm
    **/
    function depositCompounding(address farmAddress, uint amountToDeposit) external compounderExists(farmAddress){
        if(checkTiers){
            require(ITierManager(tierManager).checkTier(msg.sender) >= requiredTier, "Caller does not hold high enough tier");
        }
        IERC20 DepositToken = IERC20(farmAddressToShareInfo[farmAddress].depositToken);
        IShare ShareToken = IShare(farmAddressToShareInfo[farmAddress].shareToken);
        IFarmV2 Farm = IFarmV2(farmAddress);

        //If this is the first deposit, then make sure amountToDeposit is atleast 1000
        if(ShareToken.totalSupply() == 0){
            require(amountToDeposit >= 1000, "Gravty Finance: Min first deposit not met");
        }
        //require deposit tokens are transferred into compounder
        SafeERC20.safeTransferFrom(DepositToken, msg.sender, address(this), amountToDeposit);

        //figure out the amount of shares owed to caller
        uint sharesOwed;
        if(ShareToken.totalSupply() != 0){
            sharesOwed = amountToDeposit * ShareToken.totalSupply()/Farm.userInfo(address(this)).amount;
        }
        else{
            sharesOwed = amountToDeposit; //mint the caller as many shares as the initial deposit
        }

        //deposit tokens into farm, but keep track of how much reward token we get
        DepositToken.approve(farmAddress, amountToDeposit);
        uint rewardToReinvest = Farm.pendingReward(address(this));
        Farm.deposit(amountToDeposit);

        //mint caller their share tokens
        require(ShareToken.mint(msg.sender, sharesOwed), 'Gravity Finance: SHARE MINT FAILED');

        rewardBalance[farmAddress] += rewardToReinvest;
    }

    /**
    * @dev allows caller to exchange farm share tokens for corresponding farms deposit token
    **/
    function withdrawCompounding(address farmAddress, uint amountToWithdraw) external compounderExists(farmAddress){
        IERC20 DepositToken = IERC20(farmAddressToShareInfo[farmAddress].depositToken);
        IShare ShareToken = IShare(farmAddressToShareInfo[farmAddress].shareToken);
        IFarmV2 Farm = IFarmV2(farmAddress);

        //figure out the amount of deposit tokens owed to caller
        uint depositTokensOwed = amountToWithdraw * Farm.userInfo(address(this)).amount/ShareToken.totalSupply();

        //require shares are burned
        require(ShareToken.burn(msg.sender, amountToWithdraw), 'Gravity Finance: SHARE BURN FAILED');

        //withdraw depositTokensOwed but keep track of rewards harvested
        uint rewardToReinvest = Farm.pendingReward(address(this));
        Farm.withdraw(depositTokensOwed);

        //Transfer depositToken to caller
        SafeERC20.safeTransfer(DepositToken, msg.sender, depositTokensOwed);

        rewardBalance[farmAddress] += rewardToReinvest;
    }

    /**
    * @dev allows caller to harvest compounding farms pending rewards, in exchange for a callers fee(paid in reward token)
    use rewardBalance[farmAddress] and reinvest that
    * If reward token and deposit token are the same, then it just reinvests teh tokens.
    * If the deposit token is an LP token, then it swaps half the reward token for deposittokens
    **/
    function harvestCompounding(address farmAddress, uint[5] memory minAmounts) external compounderExists(farmAddress){
        if(txOriginOrWhitelist){
            require(whitelist[msg.sender], "Caller is not in whitelist!");
        }
        else{
            require(msg.sender == tx.origin, "Smart Contracts are not allowed");
            minAmounts[0] = 0;
            minAmounts[1] = 0;
            minAmounts[2] = 0;
            minAmounts[3] = 0;
            minAmounts[4] = 0;
        }


        IERC20 RewardToken = IERC20(farmAddressToShareInfo[farmAddress].rewardToken);//could also do Farm.farmInfo.rewardToken....
        uint rewardToReinvest;
        {
            IFarmV2 Farm = IFarmV2(farmAddress);
            //make sure pending reward is greater than min harvest
            require((Farm.pendingReward(address(this)) + rewardBalance[farmAddress]) >= farmAddressToShareInfo[farmAddress].minHarvest, 'Gravity Finance: MIN HARVEST NOT MET');
            //harvest reward keeping track of rewards harvested
            rewardToReinvest = Farm.pendingReward(address(this));
            Farm.deposit(0);
            rewardToReinvest += rewardBalance[farmAddress];
        }
        uint reward = _reinvest(farmAddress, rewardToReinvest, minAmounts);
        rewardBalance[farmAddress] = 0;
        lastHarvestDate[farmAddress] = block.timestamp;
        if(reward > 0) {SafeERC20.safeTransfer(RewardToken, msg.sender, reward);}
        emit Compounded(farmAddress, block.timestamp);
        
    }

    /**
    * @dev called at the end of harvestCompounding
    * to take any harvested rewards, convert them into the deposit token, and reinvest them
    * In order for single sided farms with different reward and deposit tokens to work, their needs to be
    * a swap pair with the reward and deposit tokens
    * In order for LP farms to work, there needs to be swap pair between reward, and lpA
    **/
    function _reinvest(address farmAddress, uint amountToReinvest, uint[5] memory minAmounts) internal returns(uint callerReward){
        IERC20 DepositToken = IERC20(farmAddressToShareInfo[farmAddress].depositToken);
        IERC20 RewardToken = IERC20(farmAddressToShareInfo[farmAddress].rewardToken);//could also do Farm.farmInfo.rewardToken....
        IFarmV2 Farm = IFarmV2(farmAddress);

        if(farmAddressToShareInfo[farmAddress].vaultFee > 0){//handle vault fee
            uint fee = farmAddressToShareInfo[farmAddress].vaultFee * amountToReinvest / 10000;
            amountToReinvest = amountToReinvest - fee;
            if(performBuyBacks[farmAddress]){
                SafeERC20.safeTransfer(RewardToken, buybacks, fee);
            }
            else{
                if(farmAddressToShareInfo[farmAddress].rewardToken == address(GFI)){//burn it
                    GFI.burn(fee);
                }
                else{//send it to fee manager
                    SafeERC20.safeTransfer(RewardToken, feeManager, fee);
                }
            }
        }
        //handle caller reward
        if(farmAddressToShareInfo[farmAddress].callerFeePercent > 0){
            callerReward = farmAddressToShareInfo[farmAddress].callerFeePercent * amountToReinvest / 10000;
            if (callerReward > farmAddressToShareInfo[farmAddress].maxCallerReward){
                callerReward = farmAddressToShareInfo[farmAddress].maxCallerReward;
            }
            amountToReinvest = amountToReinvest - callerReward;
        } 

        //check if the deposit token and the reward token are not the same
        if (farmAddressToShareInfo[farmAddress].depositToken != farmAddressToShareInfo[farmAddress].rewardToken){
            address[] memory path = new address[](2);
            uint[] memory amounts = new uint[](2);

            if (farmAddressToShareInfo[farmAddress].lpFarm){//Dealing with an LP farm so swap half the reward for deposit and supply liqduity
                if(farmAddressToShareInfo[farmAddress].rewardToken != farmAddressToShareInfo[farmAddress].lpA){
                    path[0] = farmAddressToShareInfo[farmAddress].rewardToken;
                    path[1] = farmAddressToShareInfo[farmAddress].lpA;
                    RewardToken.approve(router, amountToReinvest);
                    amounts = IUniswapV2Router02(router).swapExactTokensForTokens(
                        amountToReinvest,
                        minAmounts[0],
                        path,
                        address(this),
                        block.timestamp
                    );
                }
                else{
                    amounts[1] = amountToReinvest;
                }

                path[0] = farmAddressToShareInfo[farmAddress].lpA;
                path[1] = farmAddressToShareInfo[farmAddress].lpB;
                if(useOptimizedReinvest){
                    uint optimalAmountA;
                    IUniswapV2Pair tokenPair = IUniswapV2Pair(address(DepositToken));
                    (uint112 resA, uint112 resB,) = tokenPair.getReserves();
                    if( tokenPair.token0() == path[0]){
                        optimalAmountA = _getSwapAmt(amounts[1], resA);
                    }
                    else {
                        optimalAmountA = _getSwapAmt(amounts[1], resB);
                    }
                    //require(amounts[1]/2 >= optimalAmountA, "WHATTTTTTTT");
                    uint tmp = amounts[1] - optimalAmountA;
                    IERC20(path[0]).approve(router, optimalAmountA);
                    amounts = IUniswapV2Router02(router).swapExactTokensForTokens(
                        optimalAmountA,
                        minAmounts[1],
                        path,
                        address(this),
                        block.timestamp
                    );
                    amounts[0] = tmp;
                }
                else{
                    IERC20(path[0]).approve(router, amounts[1]/2);
                    amounts = IUniswapV2Router02(router).swapExactTokensForTokens(
                        amounts[1] / 2,
                        minAmounts[1],
                        path,
                        address(this),
                        block.timestamp
                    );
                }
                
                IERC20(path[0]).approve(router, amounts[0]);
                IERC20(path[1]).approve(router, amounts[1]);
                uint token0Var;
                uint token1Var;
                (token0Var, token1Var, amountToReinvest) = IUniswapV2Router02(router).addLiquidity(
                    path[0],
                    path[1],
                    amounts[0],
                    amounts[1],
                    minAmounts[2],
                    minAmounts[3],
                    address(this),
                    block.timestamp
                );

                require(amountToReinvest >= minAmounts[4], 'Min LP tokens not met');

                if((amounts[0] - token0Var) > 0){
                    //safe transfer
                    if((amounts[0] - token0Var) > IERC20(path[0]).balanceOf(address(this))){
                        SafeERC20.safeTransfer(IERC20(path[0]), dustPan, IERC20(path[0]).balanceOf(address(this)));
                    }
                    else{
                        SafeERC20.safeTransfer(IERC20(path[0]), dustPan, (amounts[0] - token0Var));
                    }
                }
                if((amounts[1] - token1Var) > 0){
                    if((amounts[1] - token1Var) > IERC20(path[1]).balanceOf(address(this))){
                        SafeERC20.safeTransfer(IERC20(path[1]), dustPan, IERC20(path[1]).balanceOf(address(this)));
                    }
                    else {
                        SafeERC20.safeTransfer(IERC20(path[1]), dustPan, (amounts[1] - token1Var));
                    }
                }

            }
            else{//need to swap all reward for deposit token
                path[0] = farmAddressToShareInfo[farmAddress].rewardToken;
                path[1] = farmAddressToShareInfo[farmAddress].depositToken;
                RewardToken.approve(router, amountToReinvest);
                amounts = IUniswapV2Router02(router).swapExactTokensForTokens(
                    amountToReinvest,
                    minAmounts[0],
                    path,
                    address(this),
                    block.timestamp
                );
                amountToReinvest = amounts[1]; //What we got out of the swap
            }
        }
        DepositToken.approve(address(Farm), amountToReinvest);
        Farm.deposit(amountToReinvest);
    }

    // babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
    function sqrt(uint y) internal pure returns (uint z) {
        if (y > 3) {
            z = y;
            uint x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    function _getSwapAmt(uint amtA, uint resA) internal pure returns(uint amount){
        amount = ( sqrt( (1997**2 * resA**2) + (4 * 997 * 1000 * amtA * resA) ) - (1997 * resA) ) / 1994;
    }

    function sendEarningsToIncinerator() external{
        require(incinerator != address(0), "Incinerator can't be Zero Address!");
        iGovernance(governor).delegateFee(incinerator);
        IIncinerator(incinerator).convertEarningsToGFIandBurn();
    }
}