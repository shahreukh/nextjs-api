import { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const handleSHPData = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method === "POST") {
    try {
      const { geojsonData } = req.body;

      console.log("Received GeoJSON data:", geojsonData);

      // Convert GeoJSON to a JSON string
      const geoJsonString = JSON.stringify(geojsonData);
      console.log(geoJsonString);

      // Check if the /tmp directory exists, and create it if it doesn't
      const tmpDirectory = "/tmp";
      if (!fs.existsSync(tmpDirectory)) {
        fs.mkdirSync(tmpDirectory);
      }

      // Use ogr2ogr to convert GeoJSON to SHP
      const ogr2ogr = spawn("ogr2ogr", [
        "-f",
        "ESRI Shapefile", // Specify SHP format
        path.join(tmpDirectory, "output.shp"), // Output SHP file path
        "/vsistdin/", // Input from stdin
      ]);

      // Log the command being executed
      console.log("ogr2ogr command:", ogr2ogr.spawnargs.join(" "));

      // Send GeoJSON data as a string to ogr2ogr's stdin
      ogr2ogr.stdin.write(geoJsonString);
      ogr2ogr.stdin.end();

      let dataBuffer = ""; // Buffer to store stdout data

      ogr2ogr.stdout.on("data", (data) => {
        dataBuffer += data.toString(); // Collect stdout data
      });

      ogr2ogr.stderr.on("data", (data) => {
        console.error(`ogr2ogr stderr: ${data}`);
      });

      ogr2ogr.on("close", (code) => {
        if (code === 0) {
          console.log("Conversion successful.");
          const shpFilePath = path.join(tmpDirectory, "output.shp");

          // Read the SHP file and respond with its content
          const shpData = fs.readFileSync(shpFilePath);

          // Set the response content type to SHP
          res.setHeader("Content-Type", "application/zip");

          // Respond with the SHP data
          res.status(200).send(shpData);
        } else {
          console.error(`ogr2ogr process exited with code ${code}`);
          res.status(500).json({ error: "Failed to convert GeoJSON to SHP." });
        }
      });

      // Handle any errors that occur during the ogr2ogr process
      ogr2ogr.on("error", (error) => {
        console.error("ogr2ogr error:", error);
        res.status(500).json({ error: "Failed to convert GeoJSON to SHP." });
      });
    } catch (error) {
      console.error("Error while processing GeoJSON data:", error);
      res.status(500).json({ error: "Failed to process GeoJSON data." });
    }
  } else {
    res.status(405).json({ error: "Method not allowed." });
  }
};

export default handleSHPData;
