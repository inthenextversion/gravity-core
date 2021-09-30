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
const zeroAdd = "0x0000000000000000000000000000000000000000";

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

    IDOFactory = await ethers.getContractFactory("IDOFactory");
    IDOfactory = await IDOFactory.deploy(GFI, WETH, USDC);
    await IDOfactory.deployed();

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
    await mockWETH.connect(addr1).approve(swapRouter.address, "5000000000000000000000");
    await mockWBTC.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
    await swapRouter.connect(addr1).addLiquidity(mockWETH.address, mockWBTC.address, "5000000000000000000000", "1000000000000000000000", "4900000000000000000000", "9900000000000000000000", addr1.address, 1654341846);
    wETHwBTC = await swapFactory.getPair(mockWETH.address, mockWBTC.address);
    console.log("Created wETH/wBTC");

    //Create wETH USDC pair
    await mockUSDC.connect(addr1).approve(swapRouter.address, "300000000000000000000000");
    await mockWETH.connect(addr1).approve(swapRouter.address, "100000000000000000000");
    await swapRouter.connect(addr1).addLiquidity(mockUSDC.address, mockWETH.address, "300000000000000000000000", "100000000000000000000", "290000000000000000000000", "99000000000000000000", addr1.address, 1654341846);
    USDCwETH = await swapFactory.getPair(mockUSDC.address, mockWETH.address);
    console.log("Created USDC/wETH");
    
    //Create wBTC GFI pair
    await mockGFI.transfer(addr1.address, "5000000000000000000000000");
    await mockGFI.connect(addr1).approve(swapRouter.address, "5000000000000000000000000");
    await mockWBTC.connect(addr1).approve(swapRouter.address, "1000000000000000000000");
    await swapRouter.connect(addr1).addLiquidity(mockGFI.address, mockWBTC.address, "5000000000000000000000000", "1000000000000000000000", "4900000000000000000000000", "990000000000000000000", addr1.address, 1654341846);
    GFIwBTC = await swapFactory.getPair(mockGFI.address, mockWBTC.address);
    console.log("Created  GFI/wBTC");

    //Create wETH GFI pair
    /*
    await mockGFI.transfer(addr1.address, "40000000000000000000000");
    await mockWETH.connect(addr1).approve(swapRouter.address, "100000000000000000000");
    await mockGFI.connect(addr1).approve(swapRouter.address, "40000000000000000000000");
    await swapRouter.connect(addr1).addLiquidity(mockWETH.address, mockGFI.address, "100000000000000000000", "40000000000000000000000", "10000000000000000000", "4000000000000000000000", addr1.address, 1654341846);
    wETHGFI = await swapFactory.getPair(mockWETH.address, mockGFI.address);
    console.log("Created wETH/GFI");
    */

    await farmFactory.setFeeManager(feeManager.address);
    await farmFactory.setIncinerator(incinerator.address);
    await compounderFactory.updateSharedVariables(addr5.address, feeManager.address, priceOracle.address, swapFactory.address, swapRouter.address, 95);
    await farmFactory.setHarvestFee(5);
    await compounderFactory.adjustWhitelist(IDOfactory.address, true);
    await farmFactory.adjustWhitelist(IDOfactory.address, true);

    await IDOfactory.updateSharedVariables(swapFactory.address, swapRouter.address, feeManager.address, governance.address, priceOracle.address, 90, farmFactory.address, compounderFactory.address);
    

});

describe("IDO Factory functional test", function () {
    it("Create GFI IDO", async function () {
        IDO = await ethers.getContractFactory("IDOImplementationV0");
        ido = await IDO.deploy();
        await ido.deployed();

        Agreement = await ethers.getContractFactory("IDOAgreement");
        agreement = await Agreement.deploy();
        await agreement.deployed();

        await IDOfactory.addNewIDOType("GFI-FCFS", 0, ido.address, agreement.address);

        await IDOfactory.createAgreement("GFI-FCFS", 0);
        let agreementAddress = await IDOfactory.lastAgreement();
        let idoAgreement = await ethers.getContractFactory("IDOAgreement");
        let idoagreement = await idoAgreement.attach(agreementAddress);
        console.log("Agreement Address: ", agreementAddress);

        IDOfactory.approveOrRejectIDO(true, addr1.address, agreementAddress);

        await network.provider.send("evm_setNextBlockTimestamp", [2628007000]);
        await network.provider.send("evm_mine");

        await idoagreement.setGFICommission(addr1.address);
        await idoagreement.setPackage(3);
        await idoagreement.setIDOToken(GFI);
        await idoagreement.setSaleToken(WETH);
        await idoagreement.setPrice("2500000000000000");
        await idoagreement.setSaleStart(2628007000 + 20);
        await idoagreement.setSaleEnd(2628007000 + 1000);
        await idoagreement.setCommission(2315);
        await idoagreement.adjustClientSudoUsers(addr2.address);
        await idoagreement.setTreasury(addr3.address);
        await idoagreement.setReserves(addr4.address);
        await idoagreement.setTimeLock(1800);
        await idoagreement.setGracePeriod(1800);
        await idoagreement.setTotalAmount("128000000000000000000000");
        await idoagreement.setSaleAmount("40000000000000000000000");
        await idoagreement.setTierAmounts("40000000000000000000000", 0, 0, 0);
        await idoagreement.setBuyLimits("100000000000000000000", 0, 0, 0);
        await idoagreement.adjustDeFi(0, 1000, "4000000000000000000000", WETH, "40000000000000000000000", zeroAdd, true, "40000000000000000000", 1000, 0, 1);
        await idoagreement.adjustDeFi(1, 1000, "4000000000000000000000", USDC, "40000000000000000000000", zeroAdd, true, "40000000000000000000", 1000, 0, 1);

        await idoagreement.lockVariables();
        await mockGFI.transfer(addr1.address, "128000000000000000000000");
        await mockGFI.connect(addr1).approve(IDOfactory.address, "128000000000000000000000");
        await IDOfactory.connect(addr1).createIDO(agreementAddress);

        let IDOAddress = await IDOfactory.allIDOs(0);
        IDO = await ethers.getContractFactory("IDOImplementationV0");
        ido = await IDO.attach(IDOAddress);
        console.log("END: ", Number(await idoagreement.saleEnd()));
        console.log("Block Number: ", Number(await network.provider.send("eth_blockNumber")));

        await mockWETH.connect(addr1).approve(ido.address, "100000000000000000000");
        await ido.connect(addr1).buyStake("100000000000000000000", "0x0000000000000000000000000000000000000000", 0);


        await network.provider.send("evm_setNextBlockTimestamp", [2628009000]);
        await network.provider.send("evm_mine");

        //update price for USDC/wETH pair
        await priceOracle.getPrice(USDCwETH);
        await priceOracle.getPrice(wETHwBTC);

        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");
        await ido.deploySupportingDeFi();
        
        let farm = await farmFactory.allFarms(0);
        console.log("WETH/GFI Farm: ", farm);
        console.log("WETH/GFI Compounder: ", await compounderFactory.getShareToken(farm));

        farm = await farmFactory.allFarms(1);
        console.log("USDC/GFI Farm: ", farm);
        console.log("USDC/GFI Compounder: ", await compounderFactory.getShareToken(farm));
        console.log("WETH/GFI Swap Pair: ", await swapFactory.getPair(USDC, GFI));
        console.log("USDC/GFI Swap Pair: ", await swapFactory.getPair(WETH, GFI));
        console.log("WETH Collected:", Number(await ido.sumCollected())/10**18);
        console.log("");
        console.log("Balances of Swap Pairs...");
        console.log("USDC/WETH Swap Pair: ", Number(await mockUSDC.balanceOf(await swapFactory.getPair(USDC, WETH)))/10**18, "USDC ", Number(await mockWETH.balanceOf(await swapFactory.getPair(USDC, WETH))/10**18), "WETH");
        console.log("GFI/WETH Swap Pair: ", Number(await mockGFI.balanceOf(await swapFactory.getPair(GFI, WETH)))/10**18, "GFI ", Number(await mockWETH.balanceOf(await swapFactory.getPair(GFI, WETH))/10**18), "WETH");
        console.log("GFI/USDC Swap Pair: ", Number(await mockGFI.balanceOf(await swapFactory.getPair(GFI, USDC)))/10**18, "GFI ", Number(await mockUSDC.balanceOf(await swapFactory.getPair(GFI, USDC))/10**18), "USDC");
        console.log("IDO wETH Balance: ", Number(await mockWETH.balanceOf(ido.address))/10**18);

        await ido.withdraw();

        console.log("GFI Comission Address wETH: ",  Number(await mockWETH.balanceOf(feeManager.address))/10**18);
    });

    it("Make sure Insubordination is Punished", async function () {
        await mockGFI.transfer(addr1.address, "40000000000000000000000");
        await mockWETH.connect(addr1).approve(swapRouter.address, "100000000000000000000");
        await mockGFI.connect(addr1).approve(swapRouter.address, "40000000000000000000000");
        await swapRouter.connect(addr1).addLiquidity(mockWETH.address, mockGFI.address, "100000000000000000000", "40000000000000000000000", "10000000000000000000", "4000000000000000000000", addr1.address, 2628009503);
        wETHGFI = await swapFactory.getPair(mockWETH.address, mockGFI.address);
        console.log("Created wETH/GFI");
        
        IDO = await ethers.getContractFactory("IDOImplementationV0");
        ido = await IDO.deploy();
        await ido.deployed();

        Agreement = await ethers.getContractFactory("IDOAgreement");
        agreement = await Agreement.deploy();
        await agreement.deployed();

        await IDOfactory.createAgreement("GFI-FCFS", 0);
        let agreementAddress = await IDOfactory.lastAgreement();
        let idoAgreement = await ethers.getContractFactory("IDOAgreement");
        let idoagreement = await idoAgreement.attach(agreementAddress);
        console.log("Agreement Address: ", agreementAddress);
        
        IDOfactory.approveOrRejectIDO(true, addr1.address, agreementAddress);

        await network.provider.send("evm_setNextBlockTimestamp", [2628010000]);
        await network.provider.send("evm_mine");

        await idoagreement.setGFICommission(addr1.address);
        await idoagreement.setPackage(3);
        await idoagreement.setIDOToken(GFI);
        await idoagreement.setSaleToken(WETH);
        await idoagreement.setPrice("2500000000000000");
        await idoagreement.setSaleStart(2628010000 + 20);
        await idoagreement.setSaleEnd(2628010000 + 2000);
        await idoagreement.setCommission(1000);
        await idoagreement.adjustClientSudoUsers(addr2.address);
        await idoagreement.setTreasury(addr3.address);
        await idoagreement.setReserves(addr4.address);
        await idoagreement.setTimeLock(1800);
        await idoagreement.setGracePeriod(1800);
        await idoagreement.setTotalAmount("138000000000000000000000");
        await idoagreement.setSaleAmount("50000000000000000000000");
        await idoagreement.setTierAmounts("50000000000000000000000", 0, 0, 0);
        await idoagreement.setBuyLimits("100000000000000000000", 0, 0, 0);
        await idoagreement.adjustDeFi(0, 1000, "4000000000000000000000", WETH, "40000000000000000000000", zeroAdd, true, "40000000000000000000", 1000, 0, 1);
        await idoagreement.adjustDeFi(1, 1000, "4000000000000000000000", USDC, "40000000000000000000000", zeroAdd, true, "40000000000000000000", 1000, 0, 1);

        await idoagreement.lockVariables();
        await mockGFI.transfer(addr1.address, "138000000000000000000000");
        await mockGFI.connect(addr1).approve(IDOfactory.address, "138000000000000000000000");
        await IDOfactory.connect(addr1).createIDO(agreementAddress);

        let IDOAddress = await IDOfactory.allIDOs(1);
        IDO = await ethers.getContractFactory("IDOImplementationV0");
        ido = await IDO.attach(IDOAddress);
        console.log("END: ", Number(await idoagreement.saleEnd()));
        console.log("Block Number: ", Number(await network.provider.send("eth_blockNumber")));

        await mockWETH.connect(addr1).approve(ido.address, "100000000000000000000");
        await ido.connect(addr1).buyStake("100000000000000000000", "0x0000000000000000000000000000000000000000", 0);


        await network.provider.send("evm_setNextBlockTimestamp", [2628012000]);
        await network.provider.send("evm_mine");

        //update price for USDC/wETH pair
        await priceOracle.getPrice(USDCwETH);
        await priceOracle.getPrice(wETHwBTC);

        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");
        let ownerBalBefore = await mockWETH.balanceOf(owner.address);
        let ownerBalBeforeIDO = await mockGFI.balanceOf(owner.address);
        await ido.deploySupportingDeFi();
        let ownerBalAfter = await mockWETH.balanceOf(owner.address);
        let ownerBalAfterIDO = await mockGFI.balanceOf(owner.address);
        console.log("Owner WETH Differnece: ", Number(ownerBalAfter)/10**18 - Number(ownerBalBefore/10**18));
        console.log("Owner GFI Differnece: ", Number(ownerBalAfterIDO)/10**18 - Number(ownerBalBeforeIDO)/10**18);
        
        
    });
});