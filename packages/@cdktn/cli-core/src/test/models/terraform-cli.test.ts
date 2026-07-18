// Copyright (c) HashiCorp, Inc
// SPDX-License-Identifier: MPL-2.0
import { TerraformCli, TerraformCliPlan } from "../../lib/models/terraform-cli";
import { spawnInteractive } from "../../lib/models/interactive-process";
import { SynthesizedStack } from "../../lib/synth-stack";
import { createTmpHelper } from "../test-helpers";

jest.mock("../../lib/models/interactive-process", () => ({
  spawnInteractive: jest.fn(),
}));

const tmp = createTmpHelper();

describe("terraform-cli", () => {
  describe("TerraformCli deploy lifecycle", () => {
    afterEach(() => jest.resetAllMocks());

    it("reports running before a silent process exits", async () => {
      jest.mocked(spawnInteractive).mockReturnValue({
        actions: {
          write: jest.fn(),
          writeLine: jest.fn(),
          stop: jest.fn(),
        },
        exitCode: Promise.resolve(0),
      });

      const cli = new TerraformCli(new AbortController().signal, {
        workingDirectory: tmp("terraform-cli-silent-exit-"),
      } as SynthesizedStack);
      const states: string[] = [];

      await expect(
        cli.deploy({}, (state) => states.push(state.type)),
      ).resolves.toEqual({ cancelled: false });

      expect(states).toEqual(["running"]);
    });

    it("rejects when a silent process exits unsuccessfully", async () => {
      jest.mocked(spawnInteractive).mockReturnValue({
        actions: {
          write: jest.fn(),
          writeLine: jest.fn(),
          stop: jest.fn(),
        },
        exitCode: Promise.resolve(17),
      });

      const cli = new TerraformCli(new AbortController().signal, {
        workingDirectory: tmp("terraform-cli-failed-exit-"),
      } as SynthesizedStack);

      await expect(cli.deploy({}, jest.fn())).rejects.toBe(
        "Invoking Terraform CLI failed with exit code 17",
      );
    });

    it("relays output emitted while the service starts", async () => {
      jest.mocked(spawnInteractive).mockImplementation((_config, onData) => {
        onData("early output\n");
        return {
          actions: {
            write: jest.fn(),
            writeLine: jest.fn(),
            stop: jest.fn(),
          },
          exitCode: Promise.resolve(0),
        };
      });
      const log = jest.fn();
      const cli = new TerraformCli(
        new AbortController().signal,
        {
          workingDirectory: tmp("terraform-cli-early-output-"),
        } as SynthesizedStack,
        () => log,
      );

      await cli.deploy({}, jest.fn());

      expect(log).toHaveBeenCalledWith("early output\n");
    });
  });

  describe("TerraformCliPlan", () => {
    it("#needsApply is false with no changes", () => {
      const plan = new TerraformCliPlan("./myplan", {
        resource_changes: [
          {
            address: "random_uuid.best-uuid",
            mode: "managed",
            type: "random_uuid",
            name: "best-uuid",
            provider_name: "registry.terraform.io/hashicorp/random",
            change: {
              actions: ["no-op"],
            },
          },
        ],
        output_changes: {
          uuid: {
            actions: ["no-op"],
            before: null,
          },
        },
      });
      expect(plan.needsApply).toBe(false);
    });

    it("#needsApply is true with only resource changes", () => {
      const plan = new TerraformCliPlan("./myplan", {
        resource_changes: [
          {
            address: "random_uuid.best-uuid",
            mode: "managed",
            type: "random_uuid",
            name: "best-uuid",
            provider_name: "registry.terraform.io/hashicorp/random",
            change: {
              actions: ["create"],
            },
          },
        ],
        output_changes: {
          uuid: {
            actions: ["no-op"],
            before: null,
          },
        },
      });

      expect(plan.needsApply).toBe(true);
    });

    it("#needsApply is true with only output changes", () => {
      const plan = new TerraformCliPlan("./myplan", {
        resource_changes: [
          {
            address: "random_uuid.best-uuid",
            mode: "managed",
            type: "random_uuid",
            name: "best-uuid",
            provider_name: "registry.terraform.io/hashicorp/random",
            change: {
              actions: ["no-op"],
            },
          },
        ],
        output_changes: {
          uuid: {
            actions: ["create"],
            before: null,
          },
        },
      });

      expect(plan.needsApply).toBe(true);
    });
  });
});
