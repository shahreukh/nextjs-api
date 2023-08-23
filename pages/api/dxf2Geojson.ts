import { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import cors from "cors";

const corsMiddleware = cors({
  origin: "*",
  methods: "POST",
});

const convertDgnToKml = (inputPath: string, outputPath: string) => {
  return new Promise<void>((resolve, reject) => {
    const ogr2ogr = spawn("ogr2ogr", ["-f", "KML", outputPath, inputPath]);

    ogr2ogr.stdout.on("data", (data) => {
      console.log(`ogr2ogr stdout: ${data}`);
    });

    ogr2ogr.stderr.on("data", (data) => {
      console.error(`ogr2ogr stderr: ${data}`);
    });

    ogr2ogr.on("close", (code) => {
      if (code === 0) {
        console.log("ogr2ogr process exited with code 0");
        resolve();
      } else {
        reject(`ogr2ogr process exited with code ${code}`);
      }
    });
  });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  corsMiddleware(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const { inputPath, outputPath } = req.body;

      if (!inputPath || !outputPath) {
        return res
          .status(400)
          .json({ error: "Input path and output path are required" });
      }

      await convertDgnToKml(inputPath, outputPath);

      return res.status(200).json({ message: "Conversion successful" });
    } catch (error) {
      console.error("Error:", error);
      return res
        .status(500)
        .json({ error: "An error occurred during conversion" });
    }
  });
};

export default handler;
