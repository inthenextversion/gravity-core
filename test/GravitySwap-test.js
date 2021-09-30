const { expect } = require("chai");
const { ethers, network, upgrades, getBlockNumber } = require("hardhat");
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace");

let MockERC20;
let mockWETH;
let MockGFI;
let mockGFI;
let mockSUSHI;
let mockLINK;
let SwapCaller;
let swapCaller;


//Test wallet addresses
let owner; // Test contract owner
let addr1; // Test user 1
let addr2; // Test user 2
let addr3; // Test user 3
let addr4; // Test user 4
let addr5;

let WETH;
let WBTC;
let GFI;
let USDC;
let DAI;
let WMATIC;
let LINK;
let SUSHI;

before(async function () {
    [owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockWETH = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockWETH.deployed();
    WETH = mockWETH.address;

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockLINK = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockLINK.deployed();
    LINK = mockLINK.address;

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockSUSHI = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockSUSHI.deployed();
    SUSHI = mockSUSHI.address;
    

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockWBTC.deployed();
    WBTC = mockWBTC.address;

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockUSDC = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockUSDC.deployed();
    USDC = mockUSDC.address;

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockDAI = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockDAI.deployed();
    DAI = mockDAI.address;

    MockGFI = await ethers.getContractFactory("GravityToken");
    mockGFI = await MockGFI.deploy("Mock Gravity Finance", "MGFI");
    await mockGFI.deployed();
    GFI = mockGFI.address;

    MockWMATIC = await ethers.getContractFactory("MockToken");
    mockWMATIC = await MockWMATIC.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockWMATIC.deployed();
    WMATIC = mockWMATIC.address;

    Governance = await ethers.getContractFactory("Governance");
    governance = await upgrades.deployProxy(Governance, [mockGFI.address, mockWETH.address, mockWBTC.address], { initializer: 'initialize' });
    await governance.deployed();
    await mockGFI.setGovernanceAddress(governance.address);
    await mockGFI.changeGovernanceForwarding(true);
    
    PathOracle = await ethers.getContractFactory("PathOracle");
    pathOracle = await PathOracle.deploy([mockWETH.address, mockWBTC.address, mockGFI.address, mockUSDC.address, mockDAI.address]);
    await pathOracle.deployed();
    await pathOracle.alterPath(WETH, WBTC);
    await pathOracle.alterPath(WBTC, WETH);

    PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy(300, 600);
    await priceOracle.deployed();

    SwapFactory = await ethers.getContractFactory("UniswapV2Factory");
    swapFactory = await SwapFactory.deploy(owner.address, GFI, WETH, WBTC);
    await swapFactory.deployed();

    await pathOracle.setFactory(swapFactory.address);

    SwapRouter = await ethers.getContractFactory("UniswapV2Router02");
    swapRouter = await SwapRouter.deploy(swapFactory.address, mockWMATIC.address);
    await swapRouter.deployed();

    FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(swapFactory.address);
    await feeManager.deployed();

    EarningsManager = await ethers.getContractFactory("EarningsManager");
    earningsManager = await EarningsManager.deploy(swapFactory.address);
    await earningsManager.deployed();

    SwapCaller = await ethers.getContractFactory("SwapCaller");
    swapCaller = await SwapCaller.deploy();
    await swapCaller.deployed();

    await swapFactory.setRouter(swapRouter.address);

    await swapFactory.setRouter(swapRouter.address);
    await swapFactory.setGovernor(governance.address);
    await swapFactory.setPathOracle(pathOracle.address);
    await swapFactory.setPriceOracle(priceOracle.address);
    await swapFactory.setEarningsManager(earningsManager.address);
    await swapFactory.setFeeManager(feeManager.address);
    await swapFactory.setDustPan(addr5.address);
    await swapFactory.setPaused(false);
    await swapFactory.setSlippage(95);

    await feeManager.adjustWhitelist(owner.address, true);
    await earningsManager.adjustWhitelist(owner.address, true);

});

describe("Swap Exchange Contracts functional test", function () {
    it("Should allow caller to create an LP pool", async function () {
        let pairAddress;
        await mockWETH.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
        await mockWBTC.connect(addr1).approve(swapRouter.address, "100000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockWETH.address, mockWBTC.address, "1000000000000000000000", "100000000000000000000", "990000000000000000000", "99000000000000000000", addr1.address, 1654341846);
        pairAddress = await swapFactory.getPair(mockWETH.address, mockWBTC.address);

        //Create wBTC USDC pair
        await mockUSDC.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
        await mockWBTC.connect(addr1).approve(swapRouter.address, "100000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockUSDC.address, mockWBTC.address, "1000000000000000000000", "100000000000000000000", "990000000000000000000", "99000000000000000000", addr1.address, 1654341846);
        pairAddress = await swapFactory.getPair(mockUSDC.address, mockWBTC.address);

        //Create wBTC GFI pair
        await mockGFI.transfer(addr1.address, "1000000000000000000000");
        await mockGFI.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
        await mockWBTC.connect(addr1).approve(swapRouter.address, "100000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockGFI.address, mockWBTC.address, "1000000000000000000000", "100000000000000000000", "990000000000000000000", "99000000000000000000", addr1.address, 1654341846);
        pairAddress = await swapFactory.getPair(mockGFI.address, mockWBTC.address);
    });

    it("Should allow caller to swap wBTC for wETH", async function () {
        let pairAddress;
        pairAddress = await swapFactory.getPair(mockWETH.address, mockWBTC.address);
        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(pairAddress);
        await mockWBTC.connect(addr2).approve(swapRouter.address, "1000000000000000000000");
        let path = [mockWBTC.address, mockWETH.address];
        let kBefore = await mockWETH.balanceOf(pairAddress) * await mockWBTC.balanceOf(pairAddress);
        await swapRouter.connect(addr2).swapExactTokensForTokens("1000000000000000000", "9000000000000000000", path, addr2.address, 1654341846);
        let kAfter = await mockWETH.balanceOf(pairAddress) * await mockWBTC.balanceOf(pairAddress);
        
        //Make sure k increased from swap
        expect(kAfter).to.be.above(kBefore);
        
    });

    it("Should allow caller to swap wETH for USDC", async function () {
        let pairAddress;
        pairAddress = await swapFactory.getPair(mockWETH.address, mockWBTC.address);
        let pairAddress1;
        pairAddress1 = await swapFactory.getPair(mockUSDC.address, mockWBTC.address);
        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(pairAddress);
        let holderPair = await pair.HOLDING_ADDRESS();
        await mockWETH.connect(addr2).approve(swapRouter.address, "1000000000000000000000");
        let path = [mockWETH.address, mockWBTC.address, mockUSDC.address];

        let kBefore_wETH_wBTC = await mockWETH.balanceOf(pairAddress) * await mockWBTC.balanceOf(pairAddress);
        let kBefore_USDC_wBTC = await mockUSDC.balanceOf(pairAddress1) * await mockWBTC.balanceOf(pairAddress1);
        await swapRouter.connect(addr2).swapExactTokensForTokens("1000000000000000000", "900000000000000000", path, addr2.address, 1654341846);
        let kAfter_wETH_wBTC = await mockWETH.balanceOf(pairAddress) * await mockWBTC.balanceOf(pairAddress);
        let kAfter_USDC_wBTC = await mockUSDC.balanceOf(pairAddress1) * await mockWBTC.balanceOf(pairAddress1);
        
        //Make sure both k values increased from swap
        expect(kAfter_wETH_wBTC).to.be.above(kBefore_wETH_wBTC);
        expect(kAfter_USDC_wBTC).to.be.above(kBefore_USDC_wBTC);
    });

    it("Should allow caller to swap USDC for wBTC", async function () {
        let pairAddress;
        pairAddress = await swapFactory.getPair(mockUSDC.address, mockWBTC.address);
        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(pairAddress);
        await mockUSDC.connect(addr2).approve(swapRouter.address, "1000000000000000000000");
        let path = [mockUSDC.address, mockWBTC.address];

        await swapRouter.connect(addr2).swapExactTokensForTokens("1000000000000000000", "90000000000000000", path, addr2.address, 1654341846);
    });

    it("Should allow caller to add liquidity to existing LP pools", async function () {
        
        //Add to wETH wBTC pair
        let pairAddress;
        await mockWETH.connect(addr3).approve(swapRouter.address, "1000000000000000000000");
        await mockWBTC.connect(addr3).approve(swapRouter.address, "100000000000000000000");
        await swapRouter.connect(addr3).addLiquidity(mockWETH.address, mockWBTC.address, "1000000000000000000000", "100000000000000000000", "900000000000000000000", "90000000000000000000", addr1.address, 1654341846);
        pairAddress = await swapFactory.getPair(mockWETH.address, mockWBTC.address);

        //Add to wBTC USDC pair
        await mockUSDC.connect(addr3).approve(swapRouter.address, "1000000000000000000000");
        await mockWBTC.connect(addr3).approve(swapRouter.address, "100000000000000000000");
        await swapRouter.connect(addr3).addLiquidity(mockUSDC.address, mockWBTC.address, "1000000000000000000000", "100000000000000000000", "900000000000000000000", "90000000000000000000", addr1.address, 1654341846);
        pairAddress = await swapFactory.getPair(mockUSDC.address, mockWBTC.address);

        //Add to wBTC GFI pair
        await mockGFI.transfer(addr3.address, "1000000000000000000000");
        await mockGFI.connect(addr3).approve(swapRouter.address, "1000000000000000000000");
        await mockWBTC.connect(addr3).approve(swapRouter.address, "100000000000000000000");
        await swapRouter.connect(addr3).addLiquidity(mockGFI.address, mockWBTC.address, "1000000000000000000000", "100000000000000000000", "900000000000000000000", "90000000000000000000", addr1.address, 1654341846);
        pairAddress = await swapFactory.getPair(mockGFI.address, mockWBTC.address);

    });

    it("Check Pathing", async function () {
        
        //Create DAI/GFI Pair
        let pairAddress;
        await mockGFI.transfer(addr1.address, "1000000000000000000000");
        await mockGFI.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
        await mockDAI.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockGFI.address, mockDAI.address, "1000000000000000000000", "1000000000000000000000", "990000000000000000000", "990000000000000000000", addr1.address, 1654341846);
        pairAddress = await swapFactory.getPair(mockGFI.address, mockDAI.address);

        expect(await pathOracle.pathMap(mockDAI.address)).to.equal(GFI);
        expect(await pathOracle.pathMap(mockGFI.address)).to.equal(WBTC);
        expect(await pathOracle.pathMap(mockWBTC.address)).to.equal(WETH);
        expect(await pathOracle.pathMap(mockWETH.address)).to.equal(WBTC);

        //Create random pair, use LINK/SUSHI
        await mockLINK.connect(addr1).approve(swapRouter.address, "100000000000000000000");
        await mockSUSHI.connect(addr1).approve(swapRouter.address, "10000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockLINK.address, mockSUSHI.address, "100000000000000000000", "10000000000000000000", "990000000000000000000", "99000000000000000000", addr1.address, 1654341846);
        pairAddress = await swapFactory.getPair(mockLINK.address, mockSUSHI.address);
        
        //Make sure the pathing is not complete
        expect(Number(await pathOracle.pathMap(LINK))).to.equal(0);
        expect(Number(await pathOracle.pathMap(SUSHI))).to.equal(0);
        
        //Then add a pool that creates a path LINK/GFI
        await mockGFI.transfer(addr1.address, "1000000000000000000000");
        await mockLINK.connect(addr1).approve(swapRouter.address, "100000000000000000000");
        await mockGFI.connect(addr1).approve(swapRouter.address, "10000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockLINK.address, mockGFI.address, "100000000000000000000", "10000000000000000000", "990000000000000000000", "99000000000000000000", addr1.address, 1654341846);
        pairAddress = await swapFactory.getPair(mockLINK.address, mockGFI.address);

        //Then update the path and see if it was updated properly
        await pathOracle.alterPath(SUSHI, LINK);
        await pathOracle.alterPath(LINK, GFI);
        expect(await pathOracle.pathMap(LINK)).to.equal(GFI);
        expect(await pathOracle.pathMap(SUSHI)).to.equal(LINK);

    });

    it("Check Fee Logic", async function () {
        //make a ton of swaps to build up fees
        await mockGFI.transfer(addr4.address, "1000000000000000000000");
        await mockGFI.connect(addr4).approve(swapRouter.address, "10000000000000000000000000");
        await mockDAI.connect(addr4).approve(swapRouter.address, "10000000000000000000000000");
        let path1 = [mockDAI.address, mockGFI.address];
        let path2 = [mockGFI.address, mockDAI.address];
        var i;
        for (i = 0; i < 100; i++) {
            await swapRouter.connect(addr4).swapExactTokensForTokens("100000000000000000000",  "9000000000000000000", path1, addr4.address, 1654341846);
            await swapRouter.connect(addr4).swapExactTokensForTokens("100000000000000000000", "9000000000000000000", path2, addr4.address, 1654341846);
        }

        //confirm fee manager has a balance of GFI and DAI
        expect(Number(await mockGFI.balanceOf(feeManager.address))/10**18).to.be.above(0);
        expect(Number(await mockDAI.balanceOf(feeManager.address))/10**18).to.be.above(0);

        await feeManager.validTimeWindow(mockDAI.address);//Doing this returns the time range for when a swap is valid
        await feeManager.validTimeWindow(mockGFI.address);//Doing this returns the time range for when a swap is valid
        await feeManager.validTimeWindow(mockWETH.address);//Doing this returns the time range for when a swap is valid

        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");

        feeManager.oracleStepSwap(mockDAI.address, false);
        feeManager.oracleStepSwap(mockGFI.address, false);
        feeManager.oracleStepSwap(mockWBTC.address, true);
        feeManager.deposit();

        //Confirm SOMETHING was deposited into the Governance contract
        expect(Number(await mockWETH.balanceOf(governance.address))/10**18).to.be.above(0);
        expect(Number(await mockWBTC.balanceOf(governance.address))/10**18).to.be.above(0);

    });

    
    it("Check Earnings Logic", async function () {
        
        //Create wETH/GFI Pair
        let pairAddress;
        await mockGFI.transfer(addr1.address, "100000000000000000000000000");
        await mockGFI.connect(addr1).approve(swapRouter.address, "100000000000000000000000000");
        await mockWETH.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockGFI.address, mockWETH.address, "100000000000000000000000000", "1000000000000000000000", "990000000000000000000", "990000000000000000000", addr1.address, 1654341846);
        pairAddress = await swapFactory.getPair(mockGFI.address, mockWETH.address);
        //console.log("Created  GFI/wETH at: ", pairAddress);

        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(pairAddress);
        holderPair = await pair.HOLDING_ADDRESS();

        await governance.updateFee(pairAddress);
        await mockWETH.connect(addr1).approve(governance.address, "12000000000000000000"); 
        await governance.connect(addr1).depositFee("12000000000000000000", "0"); //Deposit 12 wETH into governance contract

        await earningsManager.validTimeWindow(pairAddress);


        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");
        
        let kBefore = Number(await mockWETH.balanceOf(pairAddress))/10**18 * Number(await mockGFI.balanceOf(pairAddress))/10**18;
        console.log("wETH in Pair: ", Number(await mockWETH.balanceOf(pairAddress))/10**18);
        console.log("GFI in Pair: ", Number(await mockGFI.balanceOf(pairAddress))/10**18);
        console.log("LP Tokens Total Supply: ", Number(await pair.totalSupply()));

        let wETHInFM = Number(await mockWETH.balanceOf(feeManager.address))/10**18;
        let GFIInFM = Number(await mockGFI.balanceOf(feeManager.address))/10**18;
        console.log("WETH in Dustpan: ", Number(await mockWETH.balanceOf(addr5.address))/10**18);
        console.log("GFI in Dustpan: ", Number(await mockGFI.balanceOf(addr5.address))/10**18);
        
        //Convert GFI earnings into pool assets, deposit them, then burn LP tokens
        await earningsManager.oracleProcessEarnings(pairAddress);
        //await earningsManager.manualProcessEarnings(pairAddress, [0,0]); <- Works!
        console.log("Process Earnings for Pair");
        console.log("wETH in Pair: ", Number(await mockWETH.balanceOf(pairAddress))/10**18);
        console.log("GFI in Pair: ", Number(await mockGFI.balanceOf(pairAddress))/10**18);
        console.log("LP Tokens Total Supply: ", Number(await pair.totalSupply()));

        let kAfter = Number(await mockWETH.balanceOf(pairAddress))/10**18 * Number(await mockGFI.balanceOf(pairAddress))/10**18;
        expect(kAfter).to.be.above(kBefore);

        //All these balances should be zero
        expect(Number(await pair.balanceOf(earningsManager.address))/10**18).to.equal(0);
        expect(Number(await mockWETH.balanceOf(earningsManager.address))/10**18).to.equal(0);
        expect(Number(await mockGFI.balanceOf(earningsManager.address))/10**18).to.equal(0);

        //make sure dust pan was sent SOMETHING
        let dustPanWETH = await mockWETH.balanceOf(addr5.address);
        let dustPanGFI = await mockGFI.balanceOf(addr5.address);
        console.log("Fee Manager gained wETH: ", Number(await mockWETH.balanceOf(feeManager.address))/10**18 - wETHInFM);
        console.log("Fee Manager gained GFI: ", Number(await mockGFI.balanceOf(feeManager.address))/10**18 - GFIInFM);
        console.log("WETH in Dustpan: ", Number(await mockWETH.balanceOf(addr5.address))/10**18);
        console.log("GFI in Dustpan: ", Number(await mockGFI.balanceOf(addr5.address))/10**18);
        expect(Number(dustPanGFI + dustPanWETH)/10**18).to.be.above(0);
    });


    it("Test that a really long swap path works", async function () {
        await mockUSDC.connect(addr2).approve(swapRouter.address, "1000000000000000000000");
        let path = [USDC, WBTC, WETH, GFI, LINK, SUSHI];
        //console.log("Swap USDC for USDC with a 5 swap path");
        let balBefore = (await mockUSDC.balanceOf(addr2.address));
        await swapRouter.connect(addr2).swapExactTokensForTokens("100000000000000000", "0", path, addr2.address, 1654341846);
        let balAfter = (await mockUSDC.balanceOf(addr2.address));
        
        //Balance before trade should be higher than balance after bc of swap fees
        expect(balBefore).to.be.above(balAfter);
    });

    it("Test if pausing works, and that liquidity can only be removed", async function () {

        await mockGFI.transfer(addr4.address, "10000000000000000000000");
        await mockGFI.connect(addr4).approve(swapRouter.address, "1000000000000000000000");
        await mockWETH.connect(addr4).approve(swapRouter.address, "10000000000000000");
        await swapRouter.connect(addr4).addLiquidity(mockGFI.address, mockWETH.address, "1000000000000000000000", "10000000000000000", "9900000000000000", "9900000000000000", addr4.address, 1654341846);
        
        await swapFactory.setPaused(true);

        await mockUSDC.connect(addr2).approve(swapRouter.address, "1000000000000000000000");
        let path = [USDC, WBTC];
        await expect(swapRouter.connect(addr2).swapExactTokensForTokens("100000000000000000", "0", path, addr2.address, 1654341846)).to.be.reverted;


        await mockGFI.transfer(addr1.address, "100000000000000000000000000");
        await mockGFI.connect(addr1).approve(swapRouter.address, "1000000000000000000000000");
        await mockWETH.connect(addr1).approve(swapRouter.address, "10000000000000000000");
        await expect(swapRouter.connect(addr1).addLiquidity(mockGFI.address, mockWETH.address, "1000000000000000000000000", "10000000000000000000", "9900000000000000000", "9900000000000000000", addr1.address, 1654341846)).to.be.reverted;
    
        
        //Confirm liquidity can still be withdrawn even when paused
        
        let pairAddress = await swapFactory.getPair(GFI, WETH);
        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(pairAddress);
        let lpAmount = await pair.balanceOf(addr1.address);
        await pair.connect(addr1).approve(swapRouter.address, lpAmount);
        //console.log("addr1: ", Number(await pair.balanceOf(addr1.address)/10**18));
        let balBefore = await mockGFI.balanceOf(addr1.address);
        await swapRouter.connect(addr1).removeLiquidity(GFI, WETH, lpAmount, 0, 0, addr1.address, 1654341846);
        let balAfter = await mockGFI.balanceOf(addr1.address);
        expect(Number(balAfter - balBefore)/10**18).to.be.above(0);
    });

    it("Test if k require statement works", async function () {
        await swapFactory.setPaused(false);
        let pairAddress = await swapFactory.getPair(GFI, WETH);
        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(pairAddress);
        let reserves = await pair.getReserves();
        let amountIn = "1000000000000000000";
        let amountOut = await swapRouter.getAmountOut(amountIn, reserves[1], reserves[0]);
        amountIn = "99999999999999999"; //Send 1 wei less than needed
        await mockWETH.connect(addr1).approve(swapCaller.address, amountIn);
        await expect(swapCaller.connect(addr1).makeSwap(WETH, pairAddress, amountOut, "0", amountIn)).to.be.reverted;

        //Send correct amount of amountIn
        amountIn = "1000000000000000000";
        await mockWETH.connect(addr1).approve(swapCaller.address, amountIn);
        let GFIbefore = await mockGFI.balanceOf(addr1.address);
        await swapCaller.connect(addr1).makeSwap(WETH, pairAddress, amountOut, "0", amountIn);
        let GFIAfter = await mockGFI.balanceOf(addr1.address);
        expect(Number(GFIAfter - GFIbefore)/10**18).to.be.above(0.9995 * Number(amountOut)/10**18 - 0.0001);//0.9995 is here because the amountOut does not account for the 0.05% gov fee
        expect(Number(GFIAfter - GFIbefore)/10**18).to.be.below(0.9995 * Number(amountOut)/10**18 + 0.0001);
    });
});