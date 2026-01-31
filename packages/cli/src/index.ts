#!/usr/bin/env node

import { program } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateDiagram } from "@sketchdraw/core";

program
  .name("sketchdraw")
  .description("Generate hand-drawn style diagrams from JSON descriptions")
  .version("0.1.0");

program
  .command("render")
  .description("Render a diagram from a JSON file or stdin")
  .argument("[input]", "Input JSON file (reads from stdin if omitted)")
  .option("-o, --output <path>", "Output file path")
  .option("-f, --format <format>", "Output format: svg or png", "svg")
  .action(async (input: string | undefined, opts: { output?: string; format: string }) => {
    try {
      let jsonStr: string;

      if (input) {
        jsonStr = readFileSync(resolve(input), "utf-8");
      } else {
        // Read from stdin
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        jsonStr = Buffer.concat(chunks).toString("utf-8");
      }

      const parsed = JSON.parse(jsonStr);
      const wantPng = opts.format === "png";
      const result = await generateDiagram(parsed, { png: wantPng });

      if (opts.output) {
        const outPath = resolve(opts.output);
        if (wantPng && result.png) {
          writeFileSync(outPath, result.png);
        } else {
          writeFileSync(outPath, result.svg, "utf-8");
        }
        console.log(`Wrote ${opts.format.toUpperCase()} to ${outPath}`);
      } else {
        // Write to stdout
        if (wantPng && result.png) {
          process.stdout.write(result.png);
        } else {
          process.stdout.write(result.svg);
        }
      }
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
