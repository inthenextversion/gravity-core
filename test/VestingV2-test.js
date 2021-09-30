const { expect } = require("chai");
const { ethers, network, upgrades } = require("hardhat");
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace");

let MockERC20;
let mockWETH;
let MockGFI;
let mockGFI;
let GravityIDO;
let gravityIDO;
let IOU_ADDRESS;
let IOUToken;
let gravityIOU;

//Test wallet addresses
let owner; // Test contract owner
let addr1; // Test user 1
let addr2; // Test user 2
let addr3; // Test user 3
let addr4; // Test user 4
let addr5;

beforeEach(async function () {
    [owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockWETH = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockWETH.deployed();  

    MockERC20 = await ethers.getContractFactory("MockToken");
    mockWBTC = await MockERC20.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockWBTC.deployed();

    MockGFI = await ethers.getContractFactory("GravityToken");
    mockGFI = await MockGFI.deploy("Mock Gravity Finance", "MGFI");
    await mockGFI.deployed();

    Governance = await ethers.getContractFactory("Governance");
    governance = await upgrades.deployProxy(Governance, [mockGFI.address, mockWETH.address, mockWBTC.address], {initializer: 'initialize'});
    await governance.deployed();

    await mockGFI.setGovernanceAddress(governance.address);

   Vesting = await ethers.getContractFactory("VestingV2");
   vesting = await Vesting.deploy(mockGFI.address, mockWETH.address, mockWETH.address, 1625122800, 2592000); //final mockWETH address is just subbing in for the Goverance contract
   await vesting.deployed();
   await mockGFI.approve(vesting.address, "100000000");
   await vesting.addUser(addr1.address, "100000000");
   await mockGFI.approve(vesting.address, "200000000");
   await vesting.addUser(addr3.address, "200000000");

   await mockGFI.approve(vesting.address, "5000000000000000000000000");
   await vesting.addUser(addr4.address, "5000000000000000000000000");
   await mockGFI.approve(vesting.address, "195000000000000000000000000");
   await vesting.addUser(addr2.address, "195000000000000000000000000");

   //Just to remove wETH bal for addr4
   await mockWETH.connect(addr4).transfer(owner.address, "100000000000000000000000");
   await mockWETH.connect(addr2).transfer(owner.address, "99990000000000000000000");

   await vesting.setGovenorAddress(governance.address);
   await mockWETH.connect(addr2).approve(governance.address, "10000000000000000000");
   await vesting.setFeeCollectionBool(true);
   await governance.updateFee(vesting.address);
   await governance.connect(addr2).depositFee("10000000000000000000", "0");
});

describe("VestingV2 Contract functional test", function() {
    it("claimGFI() should send no GFI to caller if no subVesting periods are done", async function() {
        let addr1_bal = await mockGFI.balanceOf(addr1.address);
        await vesting.connect(addr1).claimGFI();
        expect (await mockGFI.balanceOf(addr1.address)).to.equal(addr1_bal);
    });

    it("Test claimGFI() if user claimed it every month", async function() {
        await network.provider.send("evm_increaseTime", [2592001]);
        await network.provider.send("evm_mine");
        await vesting.connect(addr1).claimGFI();
        let GFIafter = await mockGFI.balanceOf(addr1.address);
        expect(GFIafter).to.equal("10000000");
        await vesting.connect(addr3).claimGFI();
        let GFIafter1 = await mockGFI.balanceOf(addr3.address);
        expect(GFIafter1).to.equal("20000000");

        await network.provider.send("evm_increaseTime", [2592001]);
        await network.provider.send("evm_mine");
        await vesting.connect(addr1).claimGFI();
        GFIafter = await mockGFI.balanceOf(addr1.address);
        expect(GFIafter).to.equal("20000000");
        await vesting.connect(addr3).claimGFI();
        GFIafter1 = await mockGFI.balanceOf(addr3.address);
        expect(GFIafter1).to.equal("40000000");

        await network.provider.send("evm_increaseTime", [2592001]);
        await network.provider.send("evm_mine");
        await vesting.connect(addr1).claimGFI();
        GFIafter = await mockGFI.balanceOf(addr1.address);
        expect(GFIafter).to.equal("30000000");
        await vesting.connect(addr3).claimGFI();
        GFIafter1 = await mockGFI.balanceOf(addr3.address);
        expect(GFIafter1).to.equal("60000000");

        await network.provider.send("evm_increaseTime", [2592001]);
        await network.provider.send("evm_mine");
        await vesting.connect(addr1).claimGFI();
        GFIafter = await mockGFI.balanceOf(addr1.address);
        expect(GFIafter).to.equal("40000000");
        await vesting.connect(addr3).claimGFI();
        GFIafter1 = await mockGFI.balanceOf(addr3.address);
        expect(GFIafter1).to.equal("80000000");

        await network.provider.send("evm_increaseTime", [2592001]);
        await network.provider.send("evm_mine");
        await vesting.connect(addr1).claimGFI();
        GFIafter = await mockGFI.balanceOf(addr1.address);
        expect(GFIafter).to.equal("50000000");
        await vesting.connect(addr3).claimGFI();
        GFIafter1 = await mockGFI.balanceOf(addr3.address);
        expect(GFIafter1).to.equal("100000000");

        // Skip a month
        await network.provider.send("evm_increaseTime", [2592001]);
        await network.provider.send("evm_mine");

        await network.provider.send("evm_increaseTime", [2592001]);
        await network.provider.send("evm_mine");
        await vesting.connect(addr1).claimGFI();
        GFIafter = await mockGFI.balanceOf(addr1.address);
        expect(GFIafter).to.equal("70000000");
        await vesting.connect(addr3).claimGFI();
        GFIafter1 = await mockGFI.balanceOf(addr3.address);
        expect(GFIafter1).to.equal("140000000");

        // Skip a month
        await network.provider.send("evm_increaseTime", [2592001]);
        await network.provider.send("evm_mine");

        // Skip a month
        await network.provider.send("evm_increaseTime", [2592001]);
        await network.provider.send("evm_mine");


        await network.provider.send("evm_increaseTime", [2592001]);
        await network.provider.send("evm_mine");
        await vesting.connect(addr1).claimGFI();
        GFIafter = await mockGFI.balanceOf(addr1.address);
        expect(GFIafter).to.equal("100000000");
        await vesting.connect(addr3).claimGFI();
        GFIafter1 = await mockGFI.balanceOf(addr3.address);
        expect(GFIafter1).to.equal("200000000");

    });

    it("claimGFI() should withdraw all GFI for user if entire vesting period is over", async function() {
        await network.provider.send("evm_setNextBlockTimestamp", [1684031947]);
        await network.provider.send("evm_mine");
        await network.provider.send("evm_mine");
        await vesting.connect(addr1).claimGFI();
        let GFIafter = await mockGFI.balanceOf(addr1.address);
        expect(GFIafter).to.equal("100000000");
        await vesting.connect(addr3).claimGFI();
        let GFIafter1 = await mockGFI.balanceOf(addr3.address);
        expect(GFIafter1).to.equal("200000000");
    });

    it("claimGFI() should revert if caller has no GFI to claim", async function() {
        await expect(vesting.connect(addr5).claimGFI()).to.be.reverted;
    });

    it("claimGFI() should revert if caller has already claimed GFI", async function() {
        await network.provider.send("evm_setNextBlockTimestamp", [2685031947]);
        await network.provider.send("evm_mine");
        await vesting.connect(addr1).claimGFI();
        await expect(vesting.connect(addr1).claimGFI()).to.be.reverted;
    });
    it("updateWithdrawableFee() should send 1% of the rewards to caller and update fee ledger for GFI owners in contract", async function() {
        await vesting.connect(addr5).updateWithdrawableFee();
        await vesting.connect(addr4).collectFee();
        await vesting.connect(addr2).collectFee();
        console.log("5,000,000 GFI with 10wETH fees collected ", (await mockWETH.balanceOf(addr4.address)).toString());
        console.log("UpdateFee Caller Bal ", (await mockWETH.balanceOf(addr5.address)).toString());
        console.log("195,000,000 GFI with 10wETH fees collected ", (await mockWETH.balanceOf(addr2.address)).toString());
        console.log("Vesting wETH Balance Remaining ", (await mockWETH.balanceOf(vesting.address)).toString());
    });
});
