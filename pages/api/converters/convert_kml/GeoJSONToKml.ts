import { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

const handleKMLData = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method === "POST") {
    try {
      const { kmlData } = req.body;

      console.log("Received GeoJSON data:", kmlData);

      const geoJsonString = JSON.stringify(kmlData);
      console.log(geoJsonString);

      const tmpDirectory = "/tmp";
      if (!fs.existsSync(tmpDirectory)) {
        fs.mkdirSync(tmpDirectory);
      }

      const ogr2ogr = spawn("ogr2ogr", [
        "-f",
        "KML",
        path.join(tmpDirectory, "output.kml"),
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
          const kmlFilePath = path.join(tmpDirectory, "output.kml");

          fs.readFile(kmlFilePath, "utf8", (err, kmlContent) => {
            if (err) {
              console.error("Error reading KML file:", err);
              res.status(500).json({ error: "Failed to read KML file." });
            } else {
              console.log("KML Content:");
              console.log(kmlContent);

              res.status(200).json({ kmlData: kmlContent });
            }
          });
        } else {
          console.error(`ogr2ogr process exited with code ${code}`);
          res.status(500).json({ error: "Failed to convert GeoJSON to KML." });
        }
      });

      ogr2ogr.on("error", (error) => {
        console.error("ogr2ogr error:", error);
        res.status(500).json({ error: "Failed to convert GeoJSON to KML." });
      });
    } catch (error) {
      console.error("Error while processing GeoJSON data:", error);
      res.status(500).json({ error: "Failed to process GeoJSON data." });
    }
  } else {
    res.status(405).json({ error: "Method not allowed." });
  }
};

export default handleKMLData;
