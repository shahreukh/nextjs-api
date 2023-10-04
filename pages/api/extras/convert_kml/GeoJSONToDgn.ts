import { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const { geoJsonData } = req.body;

    if (!geoJsonData) {
      return res.status(400).json({ error: "Invalid GeoJSON data." });
    }

    const geoJsonFileName = "temp.geojson";
    fs.writeFileSync(geoJsonFileName, JSON.stringify(geoJsonData));

    const dgnFileName = "uploads/output.dgn";
    const ogr2ogrDgnCommand = `ogr2ogr -f DGN ${dgnFileName} ${geoJsonFileName}`;
    exec(ogr2ogrDgnCommand, (dgnError, dgnStdout, dgnStderr) => {
      console.log("ogr2ogr DGN output:", dgnStdout);
      if (dgnError) {
        console.error(`Error during DGN conversion: ${dgnStderr}`);
        return res.status(500).json({ error: "Error during DGN conversion." });
      }

      const dgnFilePath = path.join(process.cwd(), dgnFileName);
      const dgnStream = fs.createReadStream(dgnFilePath);

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${encodeURIComponent(path.basename(dgnFilePath))}`
      );

      dgnStream.pipe(res);

      fs.unlinkSync(geoJsonFileName);
    });
  } catch (error) {
    console.error("An error occurred during conversion:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

export default handler;
