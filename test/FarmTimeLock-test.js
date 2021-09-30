const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace");

let MockLP;
let mockLP;
let MockGFI;
let mockGFI;
let Farm0;
let farm0;
let Farm1;
let farm1;
let TimeLock;
let timeLock;

//Test wallet addresses
let owner; // Test contract owner
let addr1; // Test user 1
let addr2; // Test user 2
let addr3; // Test user 3
let addr4; // Test user 4
let addr5;
before(async function () {
    [owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();

    MockLP = await ethers.getContractFactory("MockToken");
    mockLP = await MockLP.deploy(addr1.address, addr2.address, addr3.address, addr4.address);
    await mockLP.deployed();

    MockGFI = await ethers.getContractFactory("GravityToken");
    mockGFI = await MockGFI.deploy("Mock Gravity Finance", "MGFI");
    await mockGFI.deployed();

    Farm0 = await ethers.getContractFactory("Farm_Contract");
    farm0 = await Farm0.deploy();
    await farm0.deployed();
    await mockGFI.approve(farm0.address, "1000000000000000000000000");
    await farm0.init(mockGFI.address, "1000000000000000000000000", mockLP.address, 0, 0, 0, 0, 0);

    Farm1 = await ethers.getContractFactory("Farm_Contract");
    farm1 = await Farm1.deploy();
    await farm1.deployed();
    await mockGFI.approve(farm1.address, "1000000000000000000000000");
    await farm1.init(mockGFI.address, "1000000000000000000000000", mockLP.address, 0, 0, 0, 0, 0);

    Farm2 = await ethers.getContractFactory("Farm_Contract");
    farm2 = await Farm2.deploy();
    await farm2.deployed();
    await mockGFI.approve(farm2.address, "2000000000000000000000000");
    await farm2.init(mockGFI.address, "2000000000000000000000000", mockLP.address, 0, 0, 0, 0, 0);

    let week = 604800;
    let day = 86400;
    TimeLock = await ethers.getContractFactory("FarmTimeLock");
    timeLock = await TimeLock.deploy(week, day);
    await timeLock.deployed();

    await farm0.transferOwnership(timeLock.address);
    await farm1.transferOwnership(timeLock.address);

    await mockGFI.burn(await mockGFI.balanceOf(owner.address)); //Burn all of the owners GFI
   
});

describe("Farm Time Lock Contract functional test", function() {
    it("Call Withdraw Rewards on Both Farms and call it again in 12 hours, should do nothing", async function() {
        await timeLock.callWithdrawRewards(farm0.address, "1000000000000000000000000");
        await timeLock.callWithdrawRewards(farm1.address, "500000000000000000000000");

        //wait half a day
        await network.provider.send("evm_increaseTime", [43200]);
        await network.provider.send("evm_mine");

        await timeLock.callWithdrawRewards(farm0.address, "0");
        await timeLock.callWithdrawRewards(farm1.address, "0");

        expect((await mockGFI.balanceOf(timeLock.address)).toString()).to.equal("0");
    });

    it("Wait 1 week and call Withdraw Rewards on Both Farms, reward token should be in timelock contract", async function() {
        //wait 1 week
        await network.provider.send("evm_increaseTime", [562000]); //Also confirms that calling the function again does not reset timestamp
        await network.provider.send("evm_mine");

        await timeLock.callWithdrawRewards(farm0.address, "0");
        await timeLock.callWithdrawRewards(farm1.address, "0");

        expect((await mockGFI.balanceOf(timeLock.address)).toString()).to.equal("1500000000000000000000000");

        //Also confirm that we can only call the function once and that calling it again won't work
        await timeLock.callWithdrawRewards(farm1.address, "0");
        expect((await mockGFI.balanceOf(timeLock.address)).toString()).to.equal("1500000000000000000000000");
    });

    it("Call timelock transferOwnership on both farms, wait 8 days+1sec and confirm the request expired", async function() {
        await timeLock.transferOwnershipFromLock(farm0.address, owner.address);
        await timeLock.transferOwnershipFromLock(farm1.address, owner.address);
        
        //wait 8 days + 1 sec
        await network.provider.send("evm_increaseTime", [691200]);
        await network.provider.send("evm_mine");

        await timeLock.transferOwnershipFromLock(farm0.address, owner.address);
        await timeLock.transferOwnershipFromLock(farm1.address, owner.address);

        expect(await farm0.owner()).to.equal(timeLock.address);
        expect(await farm1.owner()).to.equal(timeLock.address);
    });

    it("Call timelock transferOwnership on both farms, wait 7 days+1sec and confirm the request executes", async function() {
        //await timeLock.transferOwnershipFromLock(farm0.address, owner.address);
        //await timeLock.transferOwnershipFromLock(farm1.address, owner.address); //Arent needed bc prior call created a valid request
        
        //wait 7 days + 1 sec
        await network.provider.send("evm_increaseTime", [604801]);
        await network.provider.send("evm_mine");

        await timeLock.transferOwnershipFromLock(farm0.address, owner.address);
        await timeLock.transferOwnershipFromLock(farm1.address, owner.address);

        expect(await farm0.owner()).to.equal(owner.address);
        expect(await farm1.owner()).to.equal(owner.address);
    });

    it("Call withdrawERC20 wait a week, and check that the tokens transferred out of it", async function() {
        await timeLock.withdrawERC20(mockGFI.address, owner.address);
        
        //wait 7 days + 1 sec
        await network.provider.send("evm_increaseTime", [604801]);
        await network.provider.send("evm_mine");

        await timeLock.withdrawERC20(mockGFI.address, addr1.address); //Also check if we change an input that the call uses the original inputs

        expect((await mockGFI.balanceOf(owner.address)).toString()).to.equal("1500000000000000000000000");
        expect((await mockGFI.balanceOf(addr1.address)).toString()).to.equal("0");
    });

    it("Try calling withdrawRewards on a farm the timelock doesn't own, should revert", async function() {
        await expect(timeLock.callWithdrawRewards(farm2.address, "0")).to.be.reverted;
    });
});
