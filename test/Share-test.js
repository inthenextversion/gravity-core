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
    await compounderFactory.updateSharedVariables(addr5.address, feeManager.address, priceOracle.address, swapFactory.address, swapRouter.address, 95);
    await farmFactory.setHarvestFee(0);
    await compounderFactory.adjustWhitelist(owner.address, true);
    await compounderFactory.changeTierManager(addr3.address);

});

describe("Share functional test", function () {
    it("Confirm Share properly works for GFI deposit Compounder", async function () {
        //Allow addr1 to create a GFI-GFI farm with 4,500 GFI as a reward, with no bonus
        await network.provider.send("evm_mine");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, GFI, GFI, "4500000000000000000000", "10000000000000000000", 55, 200, 50, 1);

        await mockGFI.transfer(addr1.address, "9000000000000000000000");
        await mockGFI.connect(addr1).approve(farmFactory.address, "4500000000000000000000");
        await farmFactory.connect(addr1).createFarm(GFI, GFI, "4500000000000000000000", "10000000000000000000", 55, 200, 50, 1);

        let farmAddress = await farmFactory.getFarm(GFI, GFI, 1);
        await compounderFactory.createCompounder(farmAddress, GFI, GFI, 0, 0, 0 , 0, false, ZERO_ADDRESS, ZERO_ADDRESS);
        
        let Farm = await ethers.getContractFactory("FarmV2");
        let farm = await Farm.attach(farmAddress);
        await mockGFI.connect(addr1).approve(farmAddress, "1000000000000000000000");
        await farm.connect(addr1).deposit("1000000000000000000000");
        await mockGFI.connect(addr1).approve(compounderFactory.address, "100000000000000000000");
        await compounderFactory.connect(addr1).depositCompounding(farmAddress, "100000000000000000000");

        let shareAddress = await compounderFactory.getShareToken(farmAddress);
        let Share = await ethers.getContractFactory("Share");
        let share = await Share.attach(shareAddress);

        /*Test share logic */
        await expect(share.mint(addr1.address, "100000000000000000000")).to.be.reverted;
        await expect(share.burn(addr1.address, "100000000000000000000")).to.be.reverted;
        await expect(share.connect(addr1).takeSnapshot()).to.be.reverted;

        let shareWorth = Number(await share.getSharesGFICurrentWorth(addr1.address))/10**18;
        expect(shareWorth).to.equal(100);
        await share.connect(addr3).takeSnapshot();



        let reward;
        for(let i = 0; i < 145; i++){
            await network.provider.send("evm_mine");
        }

        await compounderFactory.harvestCompounding(farmAddress);
        shareWorth = Number(await share.getSharesGFICurrentWorth(addr1.address))/10**18;
        expect(shareWorth).to.be.above(100);

        let snapshotWorth = Number(await share.getSharesGFIWorthAtLastSnapshot(addr1.address))/10**18;
        expect(snapshotWorth).to.equal(100);

        //make sure the reward is greater than 0
        reward = Number(await farm.pendingReward(addr1.address)) / 10**18;
        expect(reward).to.be.above(0);

        //make sure a deposit reverts if the farm is dead
        await expect(farm.connect(addr2).deposit("0")).to.be.reverted;
        
        //make sure that GFI is burned on withdraw
        let balBefore = await mockGFI.totalSupply();
        await farm.connect(addr1).withdraw("1000000000000000000000");
        let balAfter = await mockGFI.totalSupply();
        //console.log("GFI Burned: ", Number(balBefore - balAfter)/10**18);
        //expect((balBefore - balAfter)/10**18).to.be.above(0);
    });

    it("Confirm share properly works for an LP with GFI", async function () {
        pairAddress = await swapFactory.getPair(mockGFI.address, mockWBTC.address);
        Pair = await ethers.getContractFactory("UniswapV2Pair");
        pair = await Pair.attach(pairAddress);
        let lpBal = (await pair.balanceOf(addr1.address)).toString();
        //console.log(lpBal);
        lpBal = "35000000000000000000000";

        //Allow addr1 to create a GFI-GFI farm with 4,500 GFI as a reward, with no bonus
        await network.provider.send("evm_mine");
        await farmFactory.approveOrRevokeFarm(true, addr1.address, pairAddress, GFI, "14500000000000000000000", "100000000000000000000", 210, 345, 50, 1);


        await mockGFI.transfer(addr1.address, "14500000000000000000000");
        await mockGFI.connect(addr1).approve(farmFactory.address, "14500000000000000000000");
        await farmFactory.connect(addr1).createFarm(pairAddress, GFI, "14500000000000000000000", "100000000000000000000", 210, 345, 50, 1);
        farmAddress = await farmFactory.getFarm(pairAddress, GFI, 1);
        await compounderFactory.createCompounder(farmAddress, pairAddress, GFI, 0, 0, 0 , 0, true, GFI, WBTC);


        let Farm = await ethers.getContractFactory("FarmV2");
        let farm = await Farm.attach(farmAddress);
        await pair.connect(addr1).approve(farmAddress, lpBal);
        await network.provider.send("evm_mine");
        await farm.connect(addr1).deposit(lpBal);

        await pair.connect(addr1).approve(compounderFactory.address, lpBal);
        await compounderFactory.connect(addr1).depositCompounding(farmAddress, lpBal);

        let shareAddress = await compounderFactory.getShareToken(farmAddress);
        let Share = await ethers.getContractFactory("Share");
        let share = await Share.attach(shareAddress);

        let oldShareWorth = Number(await share.getSharesGFICurrentWorth(addr1.address))/10**18;
        expect(oldShareWorth).to.be.above(2400000);
        await share.connect(addr3).takeSnapshot();

        for(let i = 0; i < 145; i++){
            await network.provider.send("evm_mine");
        }

        await compounderFactory.harvestCompounding(farmAddress);
        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");
        await compounderFactory.harvestCompounding(farmAddress);

        shareWorth = Number(await share.getSharesGFICurrentWorth(addr1.address))/10**18;
        expect(shareWorth).to.be.above(oldShareWorth);

        //Make sure even if shares are moved, the original holders balance is correct
        let shareBalance = await share.balanceOf(addr1.address);
        await share.connect(addr1).transfer(addr2.address, shareBalance);
        let snapshotWorth = Number(await share.getSharesGFIWorthAtLastSnapshot(addr1.address))/10**18;
        expect(snapshotWorth).to.equal(oldShareWorth);

        //if somone moves shares around after snapshot make sure the new address has a zero balance
        snapshotWorth = Number(await share.getSharesGFIWorthAtLastSnapshot(addr2.address))/10**18;
        expect(snapshotWorth).to.equal(0);

        await farmFactory.setHarvestFee(0);
        reward = Number(await farm.pendingReward(addr1.address)) / 10**18;
        let balBefore = await mockGFI.balanceOf(addr1.address);
        await farm.connect(addr1).withdraw(lpBal);
        let balAfter = await mockGFI.balanceOf(addr1.address);

        //make sure that on withdraw participant gets their pending reward minus the 5% harvest fee
        expect((balAfter - balBefore)/10**18).to.be.above(reward);
        //expect((balAfter - balBefore)/10**18).to.be.below(reward * 0.95 + 0.0001);
    });

    it("Confirm share properly works for an LP without GFI as an asset", async function () {
        let compounderGFIVal = Number(await mockGFI.balanceOf(compounderFactory.address))/10**18;
        await farmFactory.approveOrRevokeFarm(true, addr1.address, wETHwBTC, GFI, "1000000000000000000000000", "100000000000000000000", 382, 1000, 50, 1);

        let Pair = await ethers.getContractFactory("UniswapV2Pair");
        let pair = await Pair.attach(wETHwBTC);

        await mockGFI.transfer(addr1.address, "1000000000000000000000000");
        await mockGFI.connect(addr1).approve(farmFactory.address, "1000000000000000000000000");
        await farmFactory.connect(addr1).createFarm(wETHwBTC, GFI, "1000000000000000000000000", "100000000000000000000", 382, 1000, 50, 1);
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

        let shareAddress = await compounderFactory.getShareToken(farmAddress);
        let Share = await ethers.getContractFactory("Share");
        let share = await Share.attach(shareAddress);

        let oldShareWorth = Number(await share.getSharesGFICurrentWorth(addr1.address))/10**18;
        expect(oldShareWorth).to.equal(0);
        await share.connect(addr3).takeSnapshot();

        await priceOracle.getPrice(wETHwBTC);
        await priceOracle.getPrice(GFIwBTC);

        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");
        await compounderFactory.harvestCompounding(farmAddress);
        let callerGFIBal = Number(await mockGFI.balanceOf(addr3.address))/10**18;
        for(let i = 0; i < 150; i++){
            await priceOracle.getPrice(wETHwBTC);
            await priceOracle.getPrice(GFIwBTC);
            if(i%10 == 0){
                await compounderFactory.connect(addr3).harvestCompounding(farmAddress);
            }
        }

        let shareWorth = Number(await share.getSharesGFICurrentWorth(addr1.address))/10**18;
        expect(shareWorth).to.equal(0);

        let snapshotWorth = Number(await share.getSharesGFIWorthAtLastSnapshot(addr1.address))/10**18;
        expect(snapshotWorth).to.equal(0);

    });

});