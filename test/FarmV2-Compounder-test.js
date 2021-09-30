const { expect } = require("chai");
const { ethers, network, upgrades, getBlockNumber } = require("hardhat");
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace");

let MockERC20;
let mockWETH;
let MockGFI;
let mockGFI;
let mockSUSHI;
let mockLINK;
let farmWBTCGFI;


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
let wETHwBTC;
let wETHGFI;
let GFIwBTC;
let USDCwBTC;
let DAI;
let WMATIC;
let LINK;
let SUSHI;
let LINKSUSHI;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
    await feeManager.deployed;

    EarningsManager = await ethers.getContractFactory("EarningsManager");
    earningsManager = await EarningsManager.deploy(swapFactory.address);
    await earningsManager.deployed;

    FarmFactory = await ethers.getContractFactory("FarmFactory");
    farmFactory = await FarmFactory.deploy(GFI, governance.address);
    await farmFactory.deployed;

    CompounderFactory = await ethers.getContractFactory("CompounderFactory");
    compounderFactory = await CompounderFactory.deploy(GFI, farmFactory.address, 0, farmFactory.address);
    await compounderFactory.deployed;

    Incinerator = await ethers.getContractFactory("Incinerator");
    incinerator = await Incinerator.deploy(GFI, WETH, swapFactory.address, swapRouter.address, priceOracle.address);
    await incinerator.deployed;

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

    //Create swap pairs
    //create wETH/wBTC swap pair
    let pairAddress;
    await mockWETH.connect(addr1).approve(swapRouter.address, "100000000000000000000000");
    await mockWBTC.connect(addr1).approve(swapRouter.address, "20000000000000000000000");
    await swapRouter.connect(addr1).addLiquidity(mockWETH.address, mockWBTC.address, "100000000000000000000000", "20000000000000000000000", "90000000000000000000000", "19000000000000000000000", addr1.address, 1654341846);
    wETHwBTC = await swapFactory.getPair(mockWETH.address, mockWBTC.address);
    console.log("Created wETH/wBTC");

    //Create wBTC USDC pair
    await mockUSDC.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
    await mockWBTC.connect(addr1).approve(swapRouter.address, "100000000000000000000");
    await swapRouter.connect(addr1).addLiquidity(mockUSDC.address, mockWBTC.address, "1000000000000000000000", "100000000000000000000", "990000000000000000000", "99000000000000000000", addr1.address, 1654341846);
    USDCwBTC = await swapFactory.getPair(mockUSDC.address, mockWBTC.address);
    console.log("Created USDC/wBTC");

    //Create wBTC GFI pair
    await mockGFI.transfer(addr1.address, "5000000000000000000000000");
    await mockGFI.connect(addr1).approve(swapRouter.address, "5000000000000000000000000");
    await mockWBTC.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
    await swapRouter.connect(addr1).addLiquidity(mockGFI.address, mockWBTC.address, "5000000000000000000000000", "1000000000000000000000", "4900000000000000000000000", "990000000000000000000", addr1.address, 1654341846);
    GFIwBTC = await swapFactory.getPair(mockGFI.address, mockWBTC.address);
    console.log("Created  GFI/wBTC");

    //Create wETH GFI pair
    await mockGFI.transfer(addr1.address, "10000000000000000000000000");
    await mockWETH.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
    await mockGFI.connect(addr1).approve(swapRouter.address, "10000000000000000000000000");
    await swapRouter.connect(addr1).addLiquidity(mockWETH.address, mockGFI.address, "1000000000000000000000", "10000000000000000000000000", "990000000000000000000", "9900000000000000000000000", addr1.address, 1654341846);
    wETHGFI = await swapFactory.getPair(mockWETH.address, mockGFI.address);
    console.log("Created wETH/GFI");

    await farmFactory.setFeeManager(feeManager.address);
    await farmFactory.setIncinerator(incinerator.address);
    await compounderFactory.updateSharedVariables(addr5.address, feeManager.address, swapFactory.address, swapRouter.address);
    await farmFactory.setHarvestFee(0);
    await compounderFactory.adjustWhitelist(owner.address, true);

});

describe("Farm Factory functional test", function () {
    it("Create a GFI -> GFI farm", async function () {
        //Allow addr1 to create a GFI-GFI farm with 4,500 GFI as a reward, with no bonus
        await network.provider.send("evm_mine");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, GFI, GFI, "4500000000000000000000", "10000000000000000000", 55, 200, 50, 1);

        await mockGFI.transfer(addr1.address, "9000000000000000000000");
        await mockGFI.connect(addr1).approve(farmFactory.address, "4500000000000000000000");
        await farmFactory.connect(addr1).createFarm(GFI, GFI, "4500000000000000000000", "10000000000000000000", 55, 200, 50, 1);
        farmAddress = await farmFactory.getFarm(GFI, GFI, 1);
        let Farm = await ethers.getContractFactory("FarmV2");
        let farm = await Farm.attach(farmAddress);
        await mockGFI.connect(addr1).approve(farmAddress, "1000000000000000000000");
        await farm.connect(addr1).deposit("1000000000000000000000");
        let reward;
        for(let i = 0; i < 145; i++){
            await network.provider.send("evm_mine");
        }

        //make sure the reward is greater than 0
        reward = Number(await farm.pendingReward(addr1.address)) / 10**18;
        expect(reward).to.be.above(0);

        //make sure a deposit reverts if the farm is dead
        await expect(farm.connect(addr2).deposit("0")).to.be.reverted;
        
        //make sure that GFI is burned on withdraw
        let balBefore = await mockGFI.totalSupply();
        await farm.connect(addr1).withdraw("1000000000000000000000");
        let balAfter = await mockGFI.totalSupply();
        console.log("GFI Burned: ", Number(balBefore - balAfter)/10**18);
        //expect((balBefore - balAfter)/10**18).to.be.above(0);
    });

    it("Create a GFI/wBTC -> GFI farm", async function () {
        pairAddress = await swapFactory.getPair(mockGFI.address, mockWBTC.address);
        Pair = await ethers.getContractFactory("UniswapV2Pair");
        pair = await Pair.attach(pairAddress);
        let lpBal = await pair.balanceOf(addr1.address);

        //Allow addr1 to create a GFI-GFI farm with 4,500 GFI as a reward, with no bonus
        await network.provider.send("evm_mine");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, pairAddress, GFI, "14500000000000000000000", "100000000000000000000", 210, 345, 50, 1);


        await mockGFI.transfer(addr1.address, "14500000000000000000000");
        await mockGFI.connect(addr1).approve(farmFactory.address, "14500000000000000000000");
        await farmFactory.connect(addr1).createFarm(pairAddress, GFI, "14500000000000000000000", "100000000000000000000", 210, 345, 50, 1);
        farmAddress = await farmFactory.getFarm(pairAddress, GFI, 1);
        let Farm = await ethers.getContractFactory("FarmV2");
        let farm = await Farm.attach(farmAddress);
        await pair.connect(addr1).approve(farmAddress, lpBal);
        await network.provider.send("evm_mine");
        await farm.connect(addr1).deposit(lpBal);
        for(let i = 0; i < 145; i++){
            await network.provider.send("evm_mine");
        }
        await farmFactory.setHarvestFee(0);
        reward = Number(await farm.pendingReward(addr1.address)) / 10**18;
        let balBefore = await mockGFI.balanceOf(addr1.address);
        await farm.connect(addr1).withdraw(lpBal);
        let balAfter = await mockGFI.balanceOf(addr1.address);

        //make sure that on withdraw participant gets their pending reward minus the 5% harvest fee
        expect((balAfter - balBefore)/10**18).to.equal(reward);
        //expect((balAfter - balBefore)/10**18).to.be.below(reward * 0.95 + 0.0001);
    });

    it("Create a USDC -> USDC farm and compounder", async function () {
        await network.provider.send("evm_mine");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, USDC, USDC, "4500000000000000000000", "100000000000000000000", 360, 500, 50, 1);

        await mockUSDC.connect(addr1).approve(farmFactory.address, "4500000000000000000000");
        await farmFactory.connect(addr1).createFarm(USDC, USDC, "4500000000000000000000", "100000000000000000000", 360, 500, 50, 1);
        let farmAddress = await farmFactory.getFarm(USDC, USDC, 1);

        await compounderFactory.createCompounder(farmAddress, USDC, USDC, 0, "10000000000000000000", 1, "10000000000000000000", false, USDC, USDC); //GFIs at the end don't matter since lpFarm is false

        let Farm = await ethers.getContractFactory("FarmV2");
        let farm = await Farm.attach(farmAddress);
        await mockUSDC.connect(addr1).approve(farmAddress, "1000000000000000000000");
        await farm.connect(addr1).deposit("1000000000000000000000");

        
        //let fid = await farmFactory.getFarmIndex(USDC, USDC);
        await mockUSDC.connect(addr2).approve(compounderFactory.address, "1000000000000000000000");
        await compounderFactory.connect(addr2).depositCompounding(farmAddress, "1000000000000000000000");

        //confirm that if someone joins the farm and exits immediately they get very little rewards
        await mockUSDC.connect(addr3).approve(farmAddress, "1000000000000000000000");
        await farm.connect(addr3).deposit("1000000000000000000000");
        let USDCbalBefore = await mockUSDC.balanceOf(addr3.address);
        await farm.connect(addr3).withdraw("1000000000000000000000");
        let USDCbalAfter = await mockUSDC.balanceOf(addr3.address);
        expect(Number(USDCbalAfter - USDCbalBefore)/10**18).to.be.below(1040);
        
        //confirm that if someone joins the compounder and exits immediately they get no rewards
        USDCbalBefore = await mockUSDC.balanceOf(addr4.address);
        await mockUSDC.connect(addr4).approve(compounderFactory.address, "1000000000000000000000");
        await compounderFactory.connect(addr4).depositCompounding(farmAddress, "1000000000000000000000");
        
        let shareAddress = await compounderFactory.getShareToken(farmAddress);
        let Share = await ethers.getContractFactory("Share");
        let share = await Share.attach(shareAddress);
        let shareBal = await share.balanceOf(addr4.address);
        await compounderFactory.connect(addr4).withdrawCompounding(farmAddress, shareBal);
        USDCbalAfter = await mockUSDC.balanceOf(addr4.address);
        expect(Number(USDCbalAfter - USDCbalBefore)/10**18).to.equal(0);
        
        for(let i = 0; i < 145; i++){
            await network.provider.send("evm_mine");
            if(i%10 == 0 && i < 100){
                await compounderFactory.connect(addr3).harvestCompounding(farmAddress, [0,0,0,0,0]);
            }
        }

        let balBefore = await mockUSDC.balanceOf(feeManager.address);

        //Make sure that reinvesting does send USDC to Fee Manager
        //expect(balBefore).to.be.above(0);
        
        await farm.connect(addr1).withdraw("1000000000000000000000");
        let balAfter = await mockUSDC.balanceOf(feeManager.address);

        //Make sure that withdrawing from farm also sends USDC to fee manager
        //expect((balAfter - balBefore)/10**18).to.be.above(0);
        
    });

    it("Create a wETH/wBTC -> GFI farm and compounder, and make sure compounder is earning interest", async function () {
        let compounderGFIVal = Number(await mockGFI.balanceOf(compounderFactory.address))/10**18;
        await farmFactory.approveOrRevokeFarm(true, addr1.address, wETHwBTC, GFI, "1000000000000000000000000", "100000000000000000000", 520, 1000, 50, 1);

        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(wETHwBTC);

        await mockGFI.transfer(addr1.address, "1000000000000000000000000");
        await mockGFI.connect(addr1).approve(farmFactory.address, "1000000000000000000000000");
        await farmFactory.connect(addr1).createFarm(wETHwBTC, GFI, "1000000000000000000000000", "100000000000000000000", 520, 1000, 50, 1);
        let farmAddress = await farmFactory.getFarm(wETHwBTC, GFI, 1);
        let Farm = await ethers.getContractFactory("FarmV2");
        let farm = await Farm.attach(farmAddress);
        let lpBal = (await pair.balanceOf(addr1.address)).toString();

        //create compounder for wETH/wBTC -> GFI farm
        await compounderFactory.createCompounder(farmAddress, wETHwBTC, GFI, 0, "10000000000000000000", 1, "10000000000000000000", true, WBTC, WETH);

        await pair.connect(addr1).approve(compounderFactory.address, "100000000000000000000");
        await pair.connect(addr2).approve(farmAddress, "100000000000000000000");
        await pair.connect(addr1).transfer(addr2.address, "100000000000000000000");

        await network.provider.send("evm_mine");
        await network.provider.send("evm_mine");
        await compounderFactory.connect(addr1).depositCompounding(farmAddress, "100000000000000000000");
        await farm.connect(addr2).deposit("100000000000000000000");

        await priceOracle.getPrice(wETHwBTC);
        await priceOracle.getPrice(GFIwBTC);

        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");
        await compounderFactory.harvestCompounding(farmAddress, [0,0,0,0,0]);
        let callerGFIBal = Number(await mockGFI.balanceOf(addr3.address))/10**18;
        for(let i = 0; i < 150; i++){
            await priceOracle.getPrice(wETHwBTC);
            await priceOracle.getPrice(GFIwBTC);
            if(i%10 == 0){
                await compounderFactory.connect(addr3).harvestCompounding(farmAddress, [0,0,0,0,0]);
            }
        }
        expect(Number(await mockGFI.balanceOf(addr3.address))/10**18).to.be.above(callerGFIBal);
        let shareAddress = await compounderFactory.getShareToken(farmAddress);
        let Share = await ethers.getContractFactory("Share");
        let share = await Share.attach(shareAddress);
        let shares = await share.balanceOf(addr1.address);
        await share.approve(compounderFactory.address, shares);
        let balBefore = await pair.balanceOf(addr1.address);
        await compounderFactory.connect(addr1).withdrawCompounding(farmAddress, shares);
        let balAfter = await pair.balanceOf(addr1.address);

        //confirm that compounder participant is earnings something
        expect(Number(balAfter - balBefore)/10**18).to.be.above(100);

        balBefore = await pair.balanceOf(addr2.address);
        await farm.connect(addr2).emergencyWithdraw();
        balAfter = await pair.balanceOf(addr2.address);
        expect(Number(balAfter - balBefore)/10**18).to.equal(100);

        balBefore = await pair.balanceOf(addr2.address);
        await farm.connect(addr2).emergencyWithdraw();
        balAfter = await pair.balanceOf(addr2.address);
        expect(Number(balAfter - balBefore)/10**18).to.equal(0);
        let compounderGFIValAFTER = Number(await mockGFI.balanceOf(compounderFactory.address))/10**18;
    });

    it("Create a wBTC -> GFI farm and compounder, and make sure compounder is earning interest", async function () {
        await farmFactory.approveOrRevokeFarm(true, addr1.address, WBTC, GFI, "100000000000000000000000000", "100000000000000000000", 840, 1020, 50, 1);

        await mockGFI.transfer(addr1.address, "100000000000000000000000000");
        await mockGFI.connect(addr1).approve(farmFactory.address, "100000000000000000000000000");
        await farmFactory.connect(addr1).createFarm(WBTC, GFI, "100000000000000000000000000", "100000000000000000000", 840, 1020, 50, 1);
        let farmAddress = await farmFactory.getFarm(WBTC, GFI, 1);
        let Farm = await ethers.getContractFactory("FarmV2");
        farmWBTCGFI = await Farm.attach(farmAddress);
        let lpBal = (await pair.balanceOf(addr1.address)).toString();

        //create compounder for wETH/WBTC -> GFI farm
        await compounderFactory.createCompounder(farmAddress, WBTC, GFI, 0, "10000000000000000000", 1, "10000000000000000000", false, WBTC, WETH);

        await mockWBTC.connect(addr3).approve(compounderFactory.address, "100000000000000000000");
        await mockWBTC.connect(addr2).approve(farmAddress, "100000000000000000000");

        await compounderFactory.connect(addr3).depositCompounding(farmAddress, "100000000000000000000");
        await farmWBTCGFI.connect(addr2).deposit("100000000000000000000");
        let pairAddress = await swapFactory.getPair(WBTC, GFI);
        await priceOracle.getPrice(pairAddress);

        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");
        await compounderFactory.harvestCompounding(farmAddress, [0,0,0,0,0]);
        for(let i = 0; i < 150; i++){
            await priceOracle.getPrice(pairAddress);
            if(i%10 == 0 && Number(await network.provider.send("eth_blockNumber")) < 1020){
                await compounderFactory.connect(addr3).harvestCompounding(farmAddress, [0,0,0,0,0]);
            }
        }

        let shareAddress = await compounderFactory.getShareToken(farmAddress);
        let Share = await ethers.getContractFactory("Share");
        let share = await Share.attach(shareAddress);
        let shares = await share.balanceOf(addr3.address);
        await share.approve(compounderFactory.address, shares);
        let balBefore = await mockWBTC.balanceOf(addr3.address);
        await compounderFactory.connect(addr3).withdrawCompounding(farmAddress, shares);
        let balAfter = await mockWBTC.balanceOf(addr3.address);

        //confirm that after withdrawal address 3 has more wBTC then it put into the contract
        expect(Number(balAfter - balBefore)/10**18).to.be.above(100);
    });

    it("Create a GFI -> GFI farm and compounder, and check that compounder is burning GFI on reinvest", async function () {
        await farmFactory.approveOrRevokeFarm(true, addr1.address, GFI, GFI, "1000000000000000000000000", "1000000000000000000000", 1015, 1320, 0, 1);

        await mockGFI.transfer(addr1.address, "1000000000000000000000000");
        await mockGFI.connect(addr1).approve(farmFactory.address, "1000000000000000000000000");
        await farmFactory.connect(addr1).createFarm(GFI, GFI, "1000000000000000000000000", "1000000000000000000000", 1015, 1320, 0, 1);
        let farmAddress = await farmFactory.getFarm(GFI, GFI, 2);
        let Farm = await ethers.getContractFactory("FarmV2");
        let farm = await Farm.attach(farmAddress);

        //create compounder for GFI -> GFI farm
        await compounderFactory.createCompounder(farmAddress, GFI, GFI, 400, "10000000000000000000", 1, "10000000000000000000", false, WBTC, WETH);

        let fid = await farmFactory.getFarmIndex(GFI, GFI);
        await mockGFI.transfer(addr3.address, "10000000000000000000000");
        await mockGFI.transfer(addr2.address, "10000000000000000000000");
        await mockGFI.connect(addr3).approve(compounderFactory.address, "10000000000000000000000");
        await mockGFI.connect(addr2).approve(farmAddress, "10000000000000000000000");
        
        
        await compounderFactory.connect(addr3).depositCompounding(farmAddress, "10000000000000000000000");
        await farm.connect(addr2).deposit("10000000000000000000000");
        
        await farmFactory.adjustWhitelist(compounderFactory.address, true);

        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");

        let GFItotalSupplyBefore = await mockGFI.totalSupply();
        for(let i = 0; i < 150; i++){
            if(i%10 == 0){
                await compounderFactory.connect(addr3).harvestCompounding(farmAddress, [0,0,0,0,0]);
            }
            await network.provider.send("evm_mine");//Think this is needed bc pendingRewards is a view function
        }
        let GFItotalSupplyAfter = await mockGFI.totalSupply();

        //Make sure that reinvesting does burn GFI
        expect(Number(GFItotalSupplyBefore - GFItotalSupplyAfter)/10**18).to.be.above(0);
        
        //Make sure the person in the compounder earned more than the person just farming normally
        let shareAddress = await compounderFactory.getShareToken(farmAddress);
        let Share = await ethers.getContractFactory("Share");
        let share = await Share.attach(shareAddress);
        let shares = await share.balanceOf(addr3.address);
        await share.approve(compounderFactory.address, shares);
        let balBefore = await mockGFI.balanceOf(addr3.address);
        await compounderFactory.connect(addr3).withdrawCompounding(farmAddress, shares);
        let balAfter = await mockGFI.balanceOf(addr3.address);
        let balBefore1 = await mockGFI.balanceOf(addr2.address);
        await farm.connect(addr2).withdraw("10000000000000000000000");
        let balAfter1 = await mockGFI.balanceOf(addr2.address);
        expect(Number(balAfter - balBefore)/10**18).to.be.above(Number(balAfter1 - balBefore1)/10**18)
        
    });

    it("Make sure farm earnings go to Incinerator and are used to buy and burn GFI", async function () {
        //deposit fee into governance
        await mockWETH.connect(addr4).approve(governance.address, "10000000000000000000");
        await mockWBTC.connect(addr4).approve(governance.address, "2000000000000000000");
        await governance.connect(addr4).depositFee("10000000000000000000", "2000000000000000000");

        console.log("GFI in Farm: ", Number(await mockGFI.balanceOf(farmWBTCGFI.address))/10**18);
        console.log("GFI total supply: ", Number(await mockGFI.totalSupply())/10**18);
        let wETHBalBefore = (await mockWETH.balanceOf(incinerator.address));
        await farmWBTCGFI.sendEarningsToIncinerator();
        let wETHBalAfter = (await mockWETH.balanceOf(incinerator.address));
        console.log("wETH in Incinerator: ", wETHBalAfter/10**18 - wETHBalBefore/10**18);
        expect(Number(wETHBalAfter-wETHBalBefore)/10**18).to.be.above(0.833);

        let balBefore = Number(await mockGFI.totalSupply());
        await incinerator.convertEarningsToGFIandBurn();
        console.log("wETH in Incinerator: ", Number(await mockWETH.balanceOf(incinerator.address))/10**18);
        console.log("GFI total supply: ", Number(await mockGFI.totalSupply())/10**18);
        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");
        await incinerator.convertEarningsToGFIandBurn();
        console.log("wETH in Incinerator: ", Number(await mockWETH.balanceOf(incinerator.address))/10**18);
        console.log("GFI total supply: ", Number(await mockGFI.totalSupply())/10**18);
        let balAfter = Number(await mockGFI.totalSupply());
        expect((balBefore - balAfter)/10**18).to.be.above(0);
    });
    
    it("Run two compounders at once and confirm that the rewardBalance is separate", async function () {
        await mockLINK.connect(addr1).approve(farmFactory.address, "100000000000000000000000");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, LINK, LINK, "100000000000000000000000", "100000000000000000000", 1237,  2237, 0, 1);
        await farmFactory.connect(addr1).createFarm(LINK, LINK, "100000000000000000000000", "100000000000000000000", 1237,  2237, 0, 1);

        await mockSUSHI.connect(addr1).approve(farmFactory.address, "100000000000000000000000");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, SUSHI, SUSHI, "100000000000000000000000", "100000000000000000000", 1237,  2237, 0, 1);
        await farmFactory.connect(addr1).createFarm(SUSHI, SUSHI, "100000000000000000000000", "100000000000000000000", 1237,  2237, 0, 1);

        let LinkFarm = await farmFactory.getFarm(LINK, LINK, 1);
        let SushiFarm = await farmFactory.getFarm(SUSHI, SUSHI, 1);

        await compounderFactory.createCompounder(LinkFarm, LINK, LINK, 0, 0, 0 , 0, false, ZERO_ADDRESS, ZERO_ADDRESS);
        await compounderFactory.createCompounder(SushiFarm, SUSHI, SUSHI, 0, 0, 0 , 0, false, ZERO_ADDRESS, ZERO_ADDRESS);

        await mockLINK.connect(addr2).approve(compounderFactory.address, "100000000000000000000");
        await compounderFactory.connect(addr2).depositCompounding(LinkFarm, "100000000000000000000");
        await mockSUSHI.connect(addr2).approve(compounderFactory.address, "100000000000000000000");
        await compounderFactory.connect(addr2).depositCompounding(SushiFarm, "100000000000000000000");

        expect( await compounderFactory.rewardBalance(LinkFarm)).to.equal(0);
        expect( await compounderFactory.rewardBalance(SushiFarm)).to.equal(0);
        //have 100 blocks pass
        for(let i = 0; i < 100; i++){
            await network.provider.send("evm_mine");//Think this is needed bc pendingRewards is a view function
        }
        await compounderFactory.connect(addr2).depositCompounding(LinkFarm, "0");
        await compounderFactory.connect(addr2).depositCompounding(SushiFarm, "0");
        let SushiFarmRewardBalance = Number(await compounderFactory.rewardBalance(SushiFarm))/10**18;
        await compounderFactory.harvestCompounding(LinkFarm, [0,0,0,0,0]);
        expect(Number(await compounderFactory.rewardBalance(LinkFarm))/10**18).to.equal(0);
        expect(Number(await compounderFactory.rewardBalance(SushiFarm))/10**18).to.equal(SushiFarmRewardBalance);
        await compounderFactory.harvestCompounding(SushiFarm, [0,0,0,0,0]);
        expect(Number(await compounderFactory.rewardBalance(SushiFarm))/10**18).to.equal(0);

        await compounderFactory.connect(addr2).withdrawCompounding(SushiFarm, "100000000000000000000");
        await compounderFactory.connect(addr2).withdrawCompounding(LinkFarm, "100000000000000000000")
    });

    it("Create LINK/SUSHI LP, farm -> LINK, and compounder then test compounding harvesting", async function () {
        //Create SUSHI LINK pair
        await mockLINK.connect(addr1).approve(swapRouter.address, "100000000000000000000000");
        await mockSUSHI.connect(addr1).approve(swapRouter.address, "100000000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockLINK.address, mockSUSHI.address, "100000000000000000000000", "100000000000000000000000", "99000000000000000000000", "99000000000000000000000", addr1.address, 2654341846);
        LINKSUSHI = await swapFactory.getPair(mockLINK.address, mockSUSHI.address);
        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(LINKSUSHI);

        await mockLINK.connect(addr1).approve(farmFactory.address, "100000000000000000000000");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, LINKSUSHI, LINK, "100000000000000000000000", "10000000000000000000", 1360,  11360, 0, 1);
        await farmFactory.connect(addr1).createFarm(LINKSUSHI, LINK, "100000000000000000000000", "10000000000000000000", 1360,  11360, 0, 1);
        
        let LPFarm = await farmFactory.getFarm(LINKSUSHI, LINK, 1);
        await compounderFactory.createCompounder(LPFarm, LINKSUSHI, LINK, 0, 0, 0 , 0, true, LINK, SUSHI);

        let Farm = await ethers.getContractFactory("FarmV2");
        let farm = await Farm.attach(LPFarm);

        let addr1LPBal = await pair.balanceOf(addr1.address);
        await pair.connect(addr1).approve(compounderFactory.address, addr1LPBal);
        await compounderFactory.connect(addr1).depositCompounding(LPFarm, addr1LPBal);

        //have 10 blocks pass
        for(let i = 0; i < 10; i++){
            await network.provider.send("evm_mine");//Think this is needed bc pendingRewards is a view function
        }

        //This call passes bc timeTillValid is greater than zero
        await compounderFactory.harvestCompounding(LPFarm, [0,0,0,0,0]);

        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");
        expect(Number(await compounderFactory.rewardBalance(LPFarm))/10**18).to.equal(0);
        await compounderFactory.harvestCompounding(LPFarm, [0,0,0,0,0]);
        expect(Number(await compounderFactory.rewardBalance(LPFarm))/10**18).to.equal(0);
        await compounderFactory.connect(addr1).withdrawCompounding(LPFarm, addr1LPBal);
        expect(Number(await pair.balanceOf(addr1.address))/10**18).to.be.above(Number(addr1LPBal)/10**18);
        
        
        //console.log(Number(await network.provider.send("eth_blockNumber")));
    });

    it("Create LINK/SUSHI -> DAI, farm, and compounder then test compounding harvesting after farm is dead", async function () {

        //Create DAI LINK pair
        await mockSUSHI.connect(addr1).approve(swapRouter.address, "100000000000000000000000");
        await mockDAI.connect(addr1).approve(swapRouter.address, "100000000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockSUSHI.address, mockDAI.address, "100000000000000000000000", "100000000000000000000000", "99000000000000000000000", "99000000000000000000000", addr1.address, 2654341846);
        SUSHIDAI = await swapFactory.getPair(mockSUSHI.address, mockDAI.address);
        
        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(LINKSUSHI);


        await mockDAI.connect(addr1).approve(farmFactory.address, "1000000000000000000000");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, LINKSUSHI, DAI, "1000000000000000000000", "100000000000000000", 1360,  11360, 0, 1);
        await farmFactory.connect(addr1).createFarm(LINKSUSHI, DAI, "1000000000000000000000", "100000000000000000", 1360,  11360, 0, 1);

        let LPFarm = await farmFactory.getFarm(LINKSUSHI, DAI, 1);
        await compounderFactory.createCompounder(LPFarm, LINKSUSHI, DAI, 0, 0, 0 , 0, true, SUSHI, LINK);

        let addr1LPBal = await pair.balanceOf(addr1.address);
        await pair.connect(addr1).approve(compounderFactory.address, addr1LPBal);
        await compounderFactory.connect(addr1).depositCompounding(LPFarm, addr1LPBal);
    
        for(let i = 0; i < 10; i++){
            await network.provider.send("evm_mine");//Think this is needed bc pendingRewards is a view function
        }

        await compounderFactory.harvestCompounding(LPFarm, [0,0,0,0,0]);
        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");
        await compounderFactory.harvestCompounding(LPFarm, [0,0,0,0,0]);

        for(let i = 0; i < 10000; i++){
            await network.provider.send("evm_mine");//Think this is needed bc pendingRewards is a view function
        }

        //await compounderFactory.harvestCompounding(LPFarm, [0,0,0,0,0]);
        //await network.provider.send("evm_increaseTime", [300]);
        //await network.provider.send("evm_mine");
        await compounderFactory.harvestCompounding(LPFarm, [0,0,0,0,0]);
        expect(Number(await compounderFactory.rewardBalance(LPFarm))).to.equal(0);

        await compounderFactory.connect(addr1).withdrawCompounding(LPFarm, addr1LPBal);
        expect(Number(await pair.balanceOf(addr1.address))/10**18).to.be.above(Number(addr1LPBal)/10**18);

    });

    it("Create wETH/wBTC -> wMATIC, farm, and compounder then test to see how much dust is left in the contract", async function () {
        //create wETH/WMATIC swap pair
        let pairAddress;
        await mockWETH.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
        await mockWMATIC.connect(addr1).approve(swapRouter.address, "100000000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockWETH.address, mockWMATIC.address, "1000000000000000000000", "100000000000000000000000", "900000000000000000000", "90000000000000000000000", addr1.address, 1654341846);
        wETHwMATIC = await swapFactory.getPair(mockWETH.address, mockWMATIC.address);

        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(wETHwBTC);

        await mockWMATIC.connect(addr1).approve(farmFactory.address, "1000000000000000000000");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, wETHwBTC, WMATIC, "1000000000000000000000", "100000000000000000", 11400,  21400, 0, 1);
        await farmFactory.connect(addr1).createFarm(wETHwBTC, WMATIC, "1000000000000000000000", "100000000000000000", 11400,  21400, 0, 1);

        let LPFarm = await farmFactory.getFarm(wETHwBTC, WMATIC, 1);
        //make sure if there is no swap pair between reward and lpA it reverts
        await expect(compounderFactory.createCompounder(LPFarm, wETHwBTC, WMATIC, 0, 0, 0 , 0, true, WBTC, WETH)).to.be.reverted;

        await compounderFactory.createCompounder(LPFarm, wETHwBTC, WMATIC, 0, 0, 0 , 0, true, WETH, WBTC);
        expect(Number(await mockWMATIC.balanceOf(compounderFactory.address))/10**18).to.equal(0);

        let addr1LPBal = await pair.balanceOf(addr1.address);
        await pair.connect(addr1).approve(compounderFactory.address, addr1LPBal);
        await compounderFactory.connect(addr1).depositCompounding(LPFarm, addr1LPBal);

        await compounderFactory.harvestCompounding(LPFarm, [0,0,0,0,0]);
        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");

        let wETHDust = Number(await mockWETH.balanceOf(compounderFactory.address))/10**18;
        let wBTCDust = Number(await mockWBTC.balanceOf(compounderFactory.address))/10**18;
        let wETHInDusPatn = Number(await mockWETH.balanceOf(addr5.address))/10**18;

        for(let i = 0; i < 1000; i++){
            if(i%10 == 0){
                await compounderFactory.harvestCompounding(LPFarm, [0,0,0,0,0]);
                //console.log("wETH Dust in Compounder: ", Number(await mockWETH.balanceOf(compounderFactory.address))/10**18 - wETHDust);
            }
        }
        console.log("wETH in DustPan: ", Number(await mockWETH.balanceOf(addr5.address))/10**18 - wETHInDusPatn);
        //Should still be zero
        expect(Number(await mockWMATIC.balanceOf(compounderFactory.address))/10**18).to.equal(0);

        expect(Number(await mockWETH.balanceOf(compounderFactory.address))/10**18 - wETHDust).to.be.below(10**-16);
    });

    it("Create wETH/wMATIC -> wMATIC, farm, and compounder then test to see how much dust is left in the contract", async function () {
        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(wETHwMATIC);

        await mockWMATIC.connect(addr1).approve(farmFactory.address, "1000000000000000000000");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, wETHwMATIC, WMATIC, "1000000000000000000000", "100000000000000000", 11515,  21515, 0, 1);
        await farmFactory.connect(addr1).createFarm(wETHwMATIC, WMATIC, "1000000000000000000000", "100000000000000000", 11515,  21515, 0, 1);

        let LPFarm = await farmFactory.getFarm(wETHwMATIC, WMATIC, 1);

        await compounderFactory.createCompounder(LPFarm, wETHwMATIC, WMATIC, 0, 0, 0 , 0, true, WMATIC, WETH);
        expect(Number(await mockWMATIC.balanceOf(compounderFactory.address))/10**18).to.equal(0);

        let addr1LPBal = await pair.balanceOf(addr1.address);
        await pair.connect(addr1).approve(compounderFactory.address, addr1LPBal);
        await compounderFactory.connect(addr1).depositCompounding(LPFarm, addr1LPBal);

        await compounderFactory.harvestCompounding(LPFarm, [0,0,0,0,0]);
        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");

        let wETHDust = Number(await mockWETH.balanceOf(compounderFactory.address))/10**18;
        let wMATICDust = Number(await mockWMATIC.balanceOf(compounderFactory.address))/10**18;

        for(let i = 0; i < 1000; i++){
            if(i%10 == 0){
                await compounderFactory.harvestCompounding(LPFarm, [0,0,0,0,0]);
            }
        }

        expect(Number(await mockWMATIC.balanceOf(compounderFactory.address))/10**18 - wMATICDust).to.be.below(10**-16);
    });

    it("Create wETH -> wMATIC, farm, and compounder then test to see how much dust is left in the contract", async function () {
        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(wETHwMATIC);

        await mockWMATIC.connect(addr1).approve(farmFactory.address, "1000000000000000000000");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, WETH, WMATIC, "1000000000000000000000", "100000000000000000", 11515,  21515, 0, 1);
        await farmFactory.connect(addr1).createFarm(WETH, WMATIC, "1000000000000000000000", "100000000000000000", 11515,  21515, 0, 1);

        let SASFarm = await farmFactory.getFarm(WETH, WMATIC, 1);

        await compounderFactory.createCompounder(SASFarm, WETH, WMATIC, 0, 0, 0 , 0, false, ZERO_ADDRESS, ZERO_ADDRESS);

        await mockWETH.connect(addr1).approve(compounderFactory.address, "100000000000000000000");
        await compounderFactory.connect(addr1).depositCompounding(SASFarm, "100000000000000000000");

        await compounderFactory.harvestCompounding(SASFarm, [0,0,0,0,0]);
        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");

        let wETHDust = Number(await mockWETH.balanceOf(compounderFactory.address))/10**18;
        let wMATICDust = Number(await mockWMATIC.balanceOf(compounderFactory.address))/10**18;

        for(let i = 0; i < 1000; i++){
            if(i%10 == 0){
                await compounderFactory.harvestCompounding(SASFarm, [0,0,0,0,0]);
            }
        }

        expect(Number(await mockWMATIC.balanceOf(compounderFactory.address))/10**18 - wMATICDust).to.equal(0);
    });
    

    it("Create wMATIC -> wMATIC, farm, and compounder then test to see how users can break the initial deposit", async function () {
        await mockWMATIC.connect(addr3).approve(farmFactory.address, "1000000000000000000000");
        await farmFactory.approveOrRevokeFarm(true, addr3.address, WMATIC, WMATIC, "1000000000000000000000", "100000000000000000", 11720,  21720, 0, 1);
        await farmFactory.connect(addr3).createFarm(WMATIC, WMATIC, "1000000000000000000000", "100000000000000000", 11720,  21720, 0, 1);

        let SASFarm = await farmFactory.getFarm(WMATIC, WMATIC, 1);

        await compounderFactory.createCompounder(SASFarm, WMATIC, WMATIC, 0, 0, 0 , 0, false, ZERO_ADDRESS, ZERO_ADDRESS);
        
        await expect(compounderFactory.connect(addr1).depositCompounding(SASFarm, "0")).to.be.reverted;
        let shareAddress = await compounderFactory.getShareToken(SASFarm);
        let Share = await ethers.getContractFactory("Share");
        let share = await Share.attach(shareAddress);
        expect(Number(await share.balanceOf(addr1.address))).to.equal(0);
        await mockWMATIC.connect(addr4).approve(compounderFactory.address, "1000000000000000000");
        await compounderFactory.connect(addr4).depositCompounding(SASFarm, "1000000000000000000");
        expect(Number(await share.balanceOf(addr4.address))/10**18).to.equal(1);
        
        await compounderFactory.connect(addr2).depositCompounding(SASFarm, "0");
        //make sure no shares are minted if they don't deposit anything
        expect(Number(await share.balanceOf(addr2.address))/10**18).to.equal(0);
    });
});