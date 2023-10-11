import { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "40mb",
    },
  },
};

const handleDXFData = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method === "POST") {
    try {
      const { geoJsonData } = req.body;

      console.log("Received GeoJSON data:", geoJsonData);

      const geoJsonString = JSON.stringify(geoJsonData);
      console.log(geoJsonString);

      const tmpDirectory = "/tmp";
      if (!fs.existsSync(tmpDirectory)) {
        fs.mkdirSync(tmpDirectory);
      }

      const ogr2ogr = spawn("ogr2ogr", [
        "-f",
        "DXF",
        path.join(tmpDirectory, "output.dxf"),
        "/vsistdin/",
      ]);

      console.log("ogr2ogr command:", ogr2ogr.spawnargs.join(" "));

      ogr2ogr.stdin.write(geoJsonString);
      ogr2ogr.stdin.end();

      let dataBuffer = "";

      ogr2ogr.stdout.on("data", (data) => {
        dataBuffer += data.toString();
      });

      ogr2ogr.stderr.on("data", (data) => {
        console.error(`ogr2ogr stderr: ${data}`);
      });

      ogr2ogr.on("close", (code) => {
        if (code === 0) {
          console.log("Conversion successful.");
          const dxfFilePath = path.join(tmpDirectory, "output.dxf");

          fs.readFile(dxfFilePath, "utf8", (err, dxfContent) => {
            if (err) {
              console.error("Error reading DXF file:", err);
              res.status(500).json({ error: "Failed to read DXF file." });
            } else {
              console.log("DXF Content:");
              console.log(dxfContent);

              res.status(200).json({ dxfData: dxfContent });
            }
          });
        } else {
          console.error(`ogr2ogr process exited with code ${code}`);
          res.status(500).json({ error: "Failed to convert GeoJSON to DXF." });
        }
      });

      ogr2ogr.on("error", (error) => {
        console.error("ogr2ogr error:", error);
        res.status(500).json({ error: "Failed to convert GeoJSON to DXF." });
      });
    } catch (error) {
      console.error("Error while processing GeoJSON data:", error);
      res.status(500).json({ error: "Failed to process GeoJSON data." });
    }
  } else {
    res.status(405).json({ error: "Method not allowed." });
  }
};

export default handleDXFData;
