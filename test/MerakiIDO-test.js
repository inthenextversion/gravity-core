const { expect } = require("chai");
const { ethers, network, upgrades, getBlockNumber } = require("hardhat");
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace");

let MockERC20;
let mockWETH;
let MockGFI;
let mockGFI;

//Test wallet addresses
let owner; // Test contract owner
let addr1; // Test user 1
let addr2; // Test user 2
let addr3; // Test user 3
let addr4; // Test user 4
let GravityFeeManager;
let addr6; 
let MerakiTreasury;

let WETH;
let GFI;
let USDC;
let MERAKI;
let wETHGFI;
let ido;
let agreement;

before(async function () {
    [owner, addr1, addr2, addr3, addr4, GravityFeeManager, addr6, MerakiTreasury] = await ethers.getSigners();

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockWETH = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockWETH.deployed();
    WETH = mockWETH.address;

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockWBTC.deployed();
    WBTC = mockWBTC.address;

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockUSDC = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockUSDC.deployed();
    USDC = mockUSDC.address;

    MockGFI = await ethers.getContractFactory("GravityToken");
    mockGFI = await MockGFI.deploy("Mock Gravity Finance", "MGFI");
    await mockGFI.deployed();
    GFI = mockGFI.address;

    MockWMATIC = await ethers.getContractFactory("MockToken");
    mockWMATIC = await MockWMATIC.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockWMATIC.deployed();
    WMATIC = mockWMATIC.address;

    MockMeraki = await ethers.getContractFactory("MerakiToken");
    mockMeraki = await MockMeraki.deploy();
    await mockMeraki.deployed();
    MERAKI = mockMeraki.address;

    Governance = await ethers.getContractFactory("GovernanceV2");
    governance = await Governance.deploy();
    //governance = await upgrades.deployProxy(Governance, [mockGFI.address, mockWETH.address, mockWBTC.address], { initializer: 'initialize' });
    await governance.deployed();
    await governance.initialize(mockGFI.address, mockWETH.address, mockWBTC.address);
    await mockGFI.setGovernanceAddress(governance.address);
    await mockGFI.changeGovernanceForwarding(true);
    
    PathOracle = await ethers.getContractFactory("PathOracle");
    pathOracle = await PathOracle.deploy([mockWETH.address, mockWBTC.address, mockGFI.address, mockUSDC.address]);
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

    TierManager = await ethers.getContractFactory("TierManager");
    tierManager = await TierManager.deploy(mockGFI.address, governance.address, compounderFactory.address);
    await tierManager.deployed;

    await compounderFactory.changeTierManager(tierManager.address);

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
    await swapFactory.setDustPan(GravityFeeManager.address);
    await swapFactory.setPaused(false);
    await swapFactory.setSlippage(95);

    await feeManager.adjustWhitelist(owner.address, true);
    await earningsManager.adjustWhitelist(owner.address, true);

    //Create swap pairs
    let pairAddress;
    //Create wETH GFI pair
    await mockGFI.transfer(addr1.address, "1000000000000000000000000");
    await mockWETH.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
    await mockGFI.connect(addr1).approve(swapRouter.address, "1000000000000000000000000");
    await swapRouter.connect(addr1).addLiquidity(mockWETH.address, mockGFI.address, "1000000000000000000000", "1000000000000000000000000", "990000000000000000000", "990000000000000000000000", addr1.address, 1922342400);
    wETHGFI = await swapFactory.getPair(mockWETH.address, mockGFI.address);

    await mockGFI.transfer(addr2.address, "100000000000000000000000");
    await mockWETH.connect(addr2).approve(swapRouter.address, "100000000000000000000");
    await mockGFI.connect(addr2).approve(swapRouter.address, "100000000000000000000000");
    await swapRouter.connect(addr2).addLiquidity(mockWETH.address, mockGFI.address, "100000000000000000000", "100000000000000000000000", "99000000000000000000", "99000000000000000000000", addr2.address, 1922342400);

    await mockGFI.transfer(addr3.address, "10000000000000000000000");
    await mockWETH.connect(addr3).approve(swapRouter.address, "10000000000000000000");
    await mockGFI.connect(addr3).approve(swapRouter.address, "10000000000000000000000");
    await swapRouter.connect(addr3).addLiquidity(mockWETH.address, mockGFI.address, "10000000000000000000", "10000000000000000000000", "9900000000000000000", "9900000000000000000000", addr3.address, 1922342400);

    await farmFactory.setFeeManager(feeManager.address);
    await farmFactory.setIncinerator(incinerator.address);
    await compounderFactory.updateSharedVariables(GravityFeeManager.address, feeManager.address, swapFactory.address, swapRouter.address);
    await farmFactory.setHarvestFee(0);
    await compounderFactory.adjustWhitelist(owner.address, true);

    await governance.updateTiers("990000000000000000000000", "99000000000000000000000", "9900000000000000000000"); //1000000, 100000, 10000

    //create farm and compounder for wETH/GFI pair
    await farmFactory.approveOrRevokeFarm(true, addr1.address, wETHGFI, GFI, "1000000000000000000000000", "100000000000000000000", 50, 1000, 50, 1);
    let Pair = await ethers.getContractFactory("UniswapV2Pair");
    let pair = await Pair.attach(wETHGFI);
    await mockGFI.transfer(addr1.address, "1000000000000000000000000");
    await mockGFI.connect(addr1).approve(farmFactory.address, "1000000000000000000000000");
    await farmFactory.connect(addr1).createFarm(wETHGFI, GFI, "1000000000000000000000000", "100000000000000000000", 50, 1000, 50, 1);
    let farmAddress = await farmFactory.getFarm(wETHGFI, GFI, 1);
    let Farm = await ethers.getContractFactory("FarmV2");
    let farm = await Farm.attach(farmAddress);
    let lpBal = (await pair.balanceOf(addr1.address)).toString();
    //create compounder for wETH/GFI -> GFI farm
    await compounderFactory.createCompounder(farmAddress, wETHGFI, GFI, 0, "10000000000000000000", 1, "10000000000000000000", true, GFI, WETH);

    //have addr 1, 2, 3 join the compounder
    let addr1Balance = await pair.balanceOf(addr1.address);
    await pair.connect(addr1).approve(compounderFactory.address, addr1Balance);
    await compounderFactory.connect(addr1).depositCompounding(farmAddress, addr1Balance);

    let addr2Balance = await pair.balanceOf(addr2.address);
    await pair.connect(addr2).approve(compounderFactory.address, addr2Balance);
    await compounderFactory.connect(addr2).depositCompounding(farmAddress, addr2Balance);

    let addr3Balance = await pair.balanceOf(addr3.address);
    await pair.connect(addr3).approve(compounderFactory.address, addr3Balance);
    await compounderFactory.connect(addr3).depositCompounding(farmAddress, addr3Balance);

    let shareAddress = await compounderFactory.getShareToken(farmAddress);
    await tierManager.updateSupportedShareTokens(shareAddress, 0);
    await tierManager.takeSnapshotOfAllSupportedShareTokens();

    //create IDO Factory and IDO
    let IDOFactory = await ethers.getContractFactory("IDOFactory");
    let idoFactory = await IDOFactory.deploy(tierManager.address);
    await idoFactory.deployed();

    let NFT_FCFS = await ethers.getContractFactory("IDO_NFT_FCFS");
    let nft_fcfs = await NFT_FCFS.deploy();
    await nft_fcfs.deployed();

    let NFT_FCFS_Agreement = await ethers.getContractFactory("IDO_NFT_FCFS_Agreement");
    let nft_fcfs_agreement = await NFT_FCFS_Agreement.deploy();
    await nft_fcfs_agreement.deployed();

    await idoFactory.addNewIDOType("NFT-FCFS", 1, nft_fcfs.address, nft_fcfs_agreement.address);

    await idoFactory.createAgreement("NFT-FCFS", 1);

    let Agreement = await ethers.getContractFactory("IDO_NFT_FCFS_Agreement");
    agreement = await Agreement.attach(await idoFactory.lastAgreement());

    await agreement.setGFICommission(GravityFeeManager.address);
    await agreement.setIDOToken(MERAKI);//NFT address
    await agreement.setSaleToken(USDC);
    await agreement.setPrice(150000000);// 150 USDC
    await agreement.setTotalAmount(10000);
    await agreement.setSaleStart(1922342400);
    await agreement.setCommission(500);
    await agreement.adjustClientSudoUsers(addr6.address);
    await agreement.setTreasury(MerakiTreasury.address);
    await agreement.adjustRoundDelay([1800,1200,600,0]);
    await agreement.adjustMaxPerRound([0,1,5,10]);
    await agreement.adjustStaggeredStart(false);
    await agreement.adjustNFTIndex(0);
    await agreement.setWhaleStopper(30);
    await agreement.setCommissionCap(50000000000);

    await agreement.lockVariables();
    await idoFactory.approveOrRejectIDO(true, owner.address, await idoFactory.lastAgreement());
    await idoFactory.createIDO(await idoFactory.lastAgreement());
    let IDO = await ethers.getContractFactory("IDO_NFT_FCFS");
    ido = await IDO.attach(await idoFactory.allIDOs(0));

    for(let i=0; i<100; i++){
        await mockMeraki.adminBatchMint(ido.address, i*100, 100);
    }

    await mockMeraki.adminBatchMint(owner.address, 10000, 1);

});
describe("IDO functionality Test", function () {
    it("Confirm test addresses have correct tiers", async function () {
        expect(Number(await tierManager.checkTier(addr1.address))).to.equal(3);
        expect(Number(await tierManager.checkTier(addr2.address))).to.equal(2);
        expect(Number(await tierManager.checkTier(addr3.address))).to.equal(1);
        expect(Number(await tierManager.checkTier(addr4.address))).to.equal(0);
    });

    it("Confirm joining early fails for all tiers", async function () {

        await mockUSDC.connect(addr1).approve(ido.address, "150000000");
        await expect(ido.connect(addr1).join(1)).to.be.reverted;
        await expect(ido.connect(addr1).join(0)).to.be.reverted;

        await mockUSDC.connect(addr2).approve(ido.address, "150000000");
        await expect(ido.connect(addr2).join(1)).to.be.reverted;

        await mockUSDC.connect(addr3).approve(ido.address, "150000000");
        await expect(ido.connect(addr3).join(1)).to.be.reverted;
        
        await mockUSDC.connect(addr4).approve(ido.address, "150000000");
        await expect(ido.connect(addr4).join(1)).to.be.reverted;
        
    });

    it("Round 1: Check max mints, and make sure participants can only mint up to their max for this round", async function () {
        //Advance time to first round
        await network.provider.send("evm_setNextBlockTimestamp", [1922342400])
        await network.provider.send("evm_mine") // this one will have 2030-12-01 12:00 AM as its timestamp, no matter what the previous block has
        expect(await ido.getMaxMint(addr1.address)).to.equal(await agreement.maxPerRound(3));
        expect(await ido.getMaxMint(addr2.address)).to.equal(await agreement.maxPerRound(2));
        expect(await ido.getMaxMint(addr3.address)).to.equal(await agreement.maxPerRound(1));
        expect(await ido.getMaxMint(addr4.address)).to.equal(await agreement.maxPerRound(0));

        await mockUSDC.connect(addr1).approve(ido.address, "1500000000");
        await ido.connect(addr1).join(10);

        await mockUSDC.connect(addr2).approve(ido.address, "750000000");
        await ido.connect(addr2).join(5);

        await mockUSDC.connect(addr3).approve(ido.address, "150000000");
        await ido.connect(addr3).join(1);

        await mockUSDC.connect(addr1).approve(ido.address, "150000000");
        await expect(ido.connect(addr1).join(1)).to.be.reverted;

        await mockUSDC.connect(addr2).approve(ido.address, "150000000");
        await expect(ido.connect(addr2).join(1)).to.be.reverted;

        await mockUSDC.connect(addr3).approve(ido.address, "150000000");
        await expect(ido.connect(addr3).join(1)).to.be.reverted;
    });

    it("Round 2: Check max mints, and have partipants only buy some of their available NFTs", async function () {
        //Advance time to second round
        await network.provider.send("evm_setNextBlockTimestamp", [1922343000])
        await network.provider.send("evm_mine") // this one will have 2030-12-01 12:00 AM as its timestamp, no matter what the previous block has
        expect(await ido.getMaxMint(addr1.address)).to.equal(await agreement.maxPerRound(3));
        expect(await ido.getMaxMint(addr2.address)).to.equal(await agreement.maxPerRound(2));
        expect(await ido.getMaxMint(addr3.address)).to.equal(await agreement.maxPerRound(1));
        expect(await ido.getMaxMint(addr4.address)).to.equal(await agreement.maxPerRound(0));

        await mockUSDC.connect(addr1).approve(ido.address, "1500000000");
        await ido.connect(addr1).join(7);

        await mockUSDC.connect(addr2).approve(ido.address, "750000000");
        await ido.connect(addr2).join(3);

        //await mockUSDC.connect(addr3).approve(ido.address, "150000000");
        //await ido.connect(addr3).join(0);
    });

    it("Round 3: Check max mints, and have partipants max out current round, and remainder from previous round", async function () {
        //Advance time to third round
        await network.provider.send("evm_setNextBlockTimestamp", [1922343600])
        await network.provider.send("evm_mine") // this one will have 2030-12-01 12:00 AM as its timestamp, no matter what the previous block has
        expect(await ido.getMaxMint(addr1.address)).to.equal(Number(await agreement.maxPerRound(3)) + 3);
        expect(await ido.getMaxMint(addr2.address)).to.equal(Number(await agreement.maxPerRound(2)) + 2);
        expect(await ido.getMaxMint(addr3.address)).to.equal(Number(await agreement.maxPerRound(1)) + 1);
        expect(await ido.getMaxMint(addr4.address)).to.equal(Number(await agreement.maxPerRound(0)));

        await mockUSDC.connect(addr1).approve(ido.address, "1950000000");
        await ido.connect(addr1).join(13);

        await mockUSDC.connect(addr2).approve(ido.address, "1050000000");
        await ido.connect(addr2).join(7);

        await mockUSDC.connect(addr3).approve(ido.address, "300000000");
        await ido.connect(addr3).join(2);

        //Make sure all max mint are now zero
        expect(await ido.getMaxMint(addr1.address)).to.equal(0);
        expect(await ido.getMaxMint(addr2.address)).to.equal(0);
        expect(await ido.getMaxMint(addr3.address)).to.equal(0);
        expect(await ido.getMaxMint(addr4.address)).to.equal(0);

    });

    it("Public Round: Check max mints, and have participants buy in more", async function () {
        //Advance time to public round
        await network.provider.send("evm_setNextBlockTimestamp", [1922344200])
        await network.provider.send("evm_mine") // this one will have 2030-12-01 12:00 AM as its timestamp, no matter what the previous block has
        expect(await ido.getMaxMint(addr1.address)).to.equal(Number(await agreement.whaleStopper()));
        expect(await ido.getMaxMint(addr2.address)).to.equal(Number(await agreement.whaleStopper()));
        expect(await ido.getMaxMint(addr3.address)).to.equal(Number(await agreement.whaleStopper()));
        expect(await ido.getMaxMint(addr4.address)).to.equal(Number(await agreement.whaleStopper()));

        await mockUSDC.connect(addr1).approve(ido.address, "3300000000");
        await ido.connect(addr1).join(22);

        await mockUSDC.connect(addr2).approve(ido.address, "2550000000");
        await ido.connect(addr2).join(17);

        await mockUSDC.connect(addr3).approve(ido.address, "1200000000");
        await ido.connect(addr3).join(8);

        await mockUSDC.connect(addr4).approve(ido.address, "4500000000");
        await ido.connect(addr4).join(30);

        expect(await ido.getMaxMint(addr1.address)).to.equal(Number(await agreement.whaleStopper()));
        expect(await ido.getMaxMint(addr2.address)).to.equal(Number(await agreement.whaleStopper()));
        expect(await ido.getMaxMint(addr3.address)).to.equal(Number(await agreement.whaleStopper()));
        expect(await ido.getMaxMint(addr4.address)).to.equal(Number(await agreement.whaleStopper()));

        //confirm whaleStopper works
        await mockUSDC.connect(addr4).approve(ido.address, "4650000000");
        await expect(ido.connect(addr4).join(31)).to.be.reverted;

    });

    it("Sell out the sale, and confirm gravity commission is correct", async function () {
        await mockUSDC.connect(addr1).approve(ido.address, "3750000000");
        await ido.connect(addr1).join(25);
        await mockUSDC.connect(addr2).approve(ido.address, "3750000000");
        await ido.connect(addr2).join(25);
        await mockUSDC.connect(addr3).approve(ido.address, "3750000000");
        await ido.connect(addr3).join(25);

        //200 have now been sold
        await mockUSDC.connect(addr1).approve(ido.address, "367500000000");
        await mockUSDC.connect(addr2).approve(ido.address, "367500000000");
        await mockUSDC.connect(addr3).approve(ido.address, "367500000000");
        await mockUSDC.connect(addr4).approve(ido.address, "367500000000");

        for (let i=0; i<26; i++){
            await ido.connect(addr1).join(25);
            await ido.connect(addr2).join(25);
            await ido.connect(addr3).join(25);
            await ido.connect(addr4).join(25);
        }
        // Gravity Commission should be 21K 
        // Meraki 399K
        await ido.connect(owner).withdraw();
        expect(await ido.commissionAlreadyPaid()).to.equal(21000000000);
        expect(await mockUSDC.balanceOf(GravityFeeManager.address)).to.equal(21000000000);
        expect(await mockUSDC.balanceOf(MerakiTreasury.address)).to.equal(399000000000);

        for (let i=0; i<24; i++){
            await ido.connect(addr1).join(25);
            await ido.connect(addr2).join(25);
            await ido.connect(addr3).join(25);
            await ido.connect(addr4).join(25);
        }
        // Gravity Commission should be 39K 
        // Meraki 741K
        await ido.connect(addr6).withdraw();
        expect(await ido.commissionAlreadyPaid()).to.equal(39000000000);
        expect(await mockUSDC.balanceOf(GravityFeeManager.address)).to.equal(39000000000);
        expect(await mockUSDC.balanceOf(MerakiTreasury.address)).to.equal(741000000000);

        for (let i=0; i<24; i++){
            await ido.connect(addr1).join(25);
            await ido.connect(addr2).join(25);
            await ido.connect(addr3).join(25);
            await ido.connect(addr4).join(25);
        }
        // Gravity Commission should be 50K (capped) 
        // Meraki 1,090K
        await ido.connect(owner).withdraw();
        expect(await ido.commissionAlreadyPaid()).to.equal(50000000000);
        expect(await mockUSDC.balanceOf(GravityFeeManager.address)).to.equal(50000000000);
        expect(await mockUSDC.balanceOf(MerakiTreasury.address)).to.equal(1090000000000);

        for (let i=0; i<24; i++){
            await ido.connect(addr1).join(25);
            await ido.connect(addr2).join(25);
            await ido.connect(addr3).join(25);
            await ido.connect(addr4).join(25);
        }
        // Gravity Commission should be 50K (capped) 
        // Meraki 1,450K
        await ido.connect(addr6).withdraw();
        expect(await ido.commissionAlreadyPaid()).to.equal(50000000000);
        expect(await mockUSDC.balanceOf(GravityFeeManager.address)).to.equal(50000000000);
        expect(await mockUSDC.balanceOf(MerakiTreasury.address)).to.equal(1450000000000);
    });

    it("Confirm sale is sold out and that joining reverts", async function () {
        expect(await ido.fundsRaised()).to.equal(1500000000000);
        expect(await mockMeraki.balanceOf(ido.address)).to.equal(0);
        expect(await ido.currentNFT()).to.equal(10000);

        await mockUSDC.connect(addr1).approve(ido.address, "150000000");
        await expect(ido.connect(addr1).join(1)).to.be.reverted;
    });
    
});