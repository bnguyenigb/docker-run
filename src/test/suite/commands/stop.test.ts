import { assert, expect } from "chai";
import { restore, SinonSpy, SinonStub, spy, stub } from "sinon";
import { commands, window } from "vscode";

import { writeConfig } from "../../../common/config";
import { ContainerList, getWorkspaceContainers } from "../../../common/list";
import { ext } from "../../../core/ext-variables";
import { StopOperation } from "../../../core/operations";
import { clearDockerrc, setEmptyDockerrc } from "../../utils/common";
import { getMockContainerIds, removeMockContainers } from "../../utils/container";

let mockContainerIds: Array<string> = [];

suite('Stop Command Tests', () => {
    let stubQuickPick: SinonStub;
    let spyShowInformationMessage: SinonSpy;
    let spyWithProgress: SinonSpy;
    let spyShowWarningMessage: SinonSpy;

    suiteSetup(async () => {
        ext.stopOperation = new StopOperation();
    });

    setup(async () => {
        spyShowWarningMessage = spy(window, 'showWarningMessage');
        spyShowInformationMessage = spy(window, "showInformationMessage");
        spyWithProgress = spy(window, "withProgress");
        stubQuickPick = stub(window, 'showQuickPick');
    });

    teardown(async () => {
        restore();
    });

    suite('With No Available Container', async () => {

        test("Should show 'add at least one container to Workspace' message", async () => {
            await commands.executeCommand('docker-run.stop');
            const mockMessage = `Please Add At Least One Container To Workspace`;
            const spyShowWarningMessageArgs = spyShowWarningMessage.getCall(0).args[0];

            assert.strictEqual(mockMessage, spyShowWarningMessageArgs);
        });

        test("Should show 'all containers for current workspace are stopped' message", async () => {
            mockContainerIds = await getMockContainerIds(1);
            await writeConfig(mockContainerIds);
            ext.dockerode.getContainer(mockContainerIds[0]).stop();
            await commands.executeCommand('docker-run.stop');
            const mockMessage = `All Containers For Current Workspace Are Stopped`;
            const spyShowWarningMessageArgs = spyShowWarningMessage.getCall(0).args[0];

            assert.strictEqual(mockMessage, spyShowWarningMessageArgs);
            await Promise.all([
                removeMockContainers(mockContainerIds),
                clearDockerrc()
            ]);
            await setEmptyDockerrc();
        });
    });

    suite('With Available Containers', async () => {

        teardown(async () => {
            await Promise.all([
                removeMockContainers(mockContainerIds),
                clearDockerrc()
            ]);
            await setEmptyDockerrc();
        });

        test("Should show quick pick with container list", async () => {
            mockContainerIds = await getMockContainerIds(3);
            await writeConfig(mockContainerIds);
            await Promise.all(mockContainerIds.map(mockContainerId => ext.dockerode.getContainer(mockContainerId).start()));
            stubQuickPick.resolves([] as any);
            await commands.executeCommand('docker-run.stop');

            const stubQuickPickArgs = (stubQuickPick.getCall(0).args[0] as ContainerList).map(({ containerId }) => containerId);
            assert.ok(stubQuickPick.calledOnce);
            expect(mockContainerIds).to.have.deep.members(stubQuickPickArgs);

        });

        test("Should show 'please select at least one container to stop' warning message, if no container selected", async () => {
            mockContainerIds = await getMockContainerIds(3);
            await writeConfig(mockContainerIds);
            await Promise.all(mockContainerIds.map(mockContainerId => ext.dockerode.getContainer(mockContainerId).start()));
            stubQuickPick.resolves([] as any);
            const mockMessage = `Please Select At least One Container To Stop`;

            await commands.executeCommand('docker-run.stop');
            
            const spyShowWarningMessageArgs = spyShowWarningMessage.getCall(0).args[0];
            assert.ok(stubQuickPick.calledOnce);
            assert.strictEqual(mockMessage, spyShowWarningMessageArgs);

        });

        test("Should stop single container, if single container selected", async () => {
            mockContainerIds = await getMockContainerIds(1);
            await writeConfig(mockContainerIds);
            const mockContainersList = await getWorkspaceContainers(true);
            await ext.dockerode.getContainer(mockContainerIds[0]).start();
            stubQuickPick.resolves([{ label: 'Test', containerId: mockContainerIds[0] }] as any);
            const mockMessage = `Successfully Stopped Test`;

            await commands.executeCommand('docker-run.stop');

            const stoppedContainers = await getWorkspaceContainers(false, false);
            const spyShowInformationMessageArgs = spyShowInformationMessage.getCall(0).args[0];

            assert.ok(stubQuickPick.calledOnce);
            assert.ok(spyWithProgress.calledAfter(stubQuickPick));
            assert.ok(spyShowInformationMessage.calledAfter(spyWithProgress));
            assert.strictEqual(mockMessage, spyShowInformationMessageArgs);
            expect(stoppedContainers).to.have.deep.members(mockContainersList);
        });

        test("Should stop multiple containers, if multiple containers selected", async () => {
            mockContainerIds = await getMockContainerIds(3);
            await writeConfig(mockContainerIds);
            const mockContainersList = await getWorkspaceContainers(true);
            await Promise.all(mockContainerIds.map(mockContainerId => ext.dockerode.getContainer(mockContainerId).start()));
            const mockListItems = mockContainerIds.map((containerId, index) => ({
                label: `Test_${index + 1}`, containerId
            }));
            stubQuickPick.resolves(mockListItems as any);
            const mockMessages = mockListItems.map(({ label }) => `Successfully Stopped ${label}`);

            await commands.executeCommand('docker-run.stop');

            const stoppedContainers = await getWorkspaceContainers(false, false);
            const spyShowInformationMessageArgs = spyShowInformationMessage.getCalls().map(({ args }) => args[0]);
            
            assert.ok(stubQuickPick.calledOnce);
            assert.ok(spyWithProgress.calledAfter(stubQuickPick));
            assert.ok(spyShowInformationMessage.calledAfter(spyWithProgress));
            assert.strictEqual(spyShowInformationMessage.callCount, mockContainerIds.length);
            expect(mockMessages).to.have.deep.members(spyShowInformationMessageArgs);
            expect(stoppedContainers).to.have.deep.members(mockContainersList);
        });
    });

});