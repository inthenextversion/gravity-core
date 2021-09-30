const { expect } = require("chai");
const { ethers, network } = require("hardhat");
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

   Locking = await ethers.getContractFactory("Locking");
   locking = await Locking.deploy(mockGFI.address, mockWETH.address, mockWETH.address); //final mockWETH address is just subbing in for the Goverance contract
   await locking.deployed();

   await mockGFI.approve(locking.address, "100000000");
   await locking.addUser(addr1.address, "100000000");
   await mockGFI.approve(locking.address, "200000000");
   await locking.addUser(addr3.address, "200000000");
   await mockGFI.approve(locking.address, "5000000000000000000000000");
   await locking.addUser(addr4.address, "5000000000000000000000000");
   await mockGFI.approve(locking.address, "195000000000000000000000000");
   await locking.addUser(addr2.address, "195000000000000000000000000");

   //Just to remove wETH bal for addr4
   await mockWETH.connect(addr4).transfer(owner.address, "100000000000000000000000");

   await locking.setGovenorAddress(governance.address);
   await mockWETH.connect(addr2).approve(governance.address, "10000000000000000000");
   await locking.setFeeCollectionBool(true);
   await governance.updateFee(locking.address);
   await governance.connect(addr2).depositFee("1000000000000000000", "0");
});

describe("Locking Contract functional test", function() {
    it("claimGFI() should revert if called before vesting period is over", async function() {
        await expect(locking.connect(addr1).claimGFI()).to.be.reverted;
    });

    it("claimGFI() should work if vesting period is over", async function() {
        await network.provider.send("evm_setNextBlockTimestamp", [1684031947]);
        await network.provider.send("evm_mine");
        await network.provider.send("evm_mine");
        await locking.connect(addr1).claimGFI();
        let GFIafter = await mockGFI.balanceOf(addr1.address);
        expect(GFIafter).to.equal("100000000");
        await locking.connect(addr3).claimGFI();
        let GFIafter1 = await mockGFI.balanceOf(addr3.address);
        expect(GFIafter1).to.equal("200000000");
    });

    it("claimGFI() should revert if caller has no GFI to claim", async function() {
        await expect(locking.connect(addr2).claimGFI()).to.be.reverted;
    });

    it("claimGFI() should revert if caller has already claimed GFI", async function() {
        await network.provider.send("evm_setNextBlockTimestamp", [2685031947]);
        await network.provider.send("evm_mine");
        await network.provider.send("evm_mine");
        await locking.connect(addr1).claimGFI();
        await expect(locking.connect(addr1).claimGFI()).to.be.reverted;
    });

    it("updateWithdrawableFee() should send 1% of the rewards to caller and update fee ledger for GFI owners in contract", async function() {
        await locking.connect(addr5).updateWithdrawableFee();
        await locking.connect(addr4).collectFee();
        await locking.connect(addr2).collectFee();

        // Make sure they can't claim any extra fee
        await expect(locking.connect(addr2).collectFee()).to.be.reverted;
        await locking.connect(addr5).updateWithdrawableFee();
        await expect(locking.connect(addr4).collectFee()).to.be.reverted;

        await governance.connect(addr2).depositFee("1000000000000000000", "0");
        await locking.connect(addr5).updateWithdrawableFee();
        await locking.connect(addr4).collectFee();
        await locking.connect(addr2).collectFee();

        await governance.connect(addr2).depositFee("1000000000000000000", "0");
        await governance.connect(addr2).depositFee("1000000000000000000", "0");
        await locking.connect(addr5).updateWithdrawableFee();
        await locking.connect(addr4).collectFee();
        await locking.connect(addr2).collectFee();

        console.log("Address 4 wETH Balance: ", (await mockWETH.balanceOf(addr4.address)).toString());
    });



});
