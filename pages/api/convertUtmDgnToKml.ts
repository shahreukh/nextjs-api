import { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import { promisify } from "util";
import { exec } from "child_process";
import { promises as fsPromises } from "fs";
import cors from "cors";

const corsMiddleware = cors({
  origin: "*",
  methods: "POST",
  allowedHeaders: "Content-Type",
});

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 300 * 1024 * 1024,
  },
});

const execPromise = promisify(exec);

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const handleApiRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  corsMiddleware(req, res, async () => {
    await upload.single("dgnFile")(req, res, async (err) => {
      if (err) {
        console.log("File upload error:", err);
        return res.status(400).json({ error: "File upload error." });
      }
      const zone = req.body.selectedZone;
      const hemisphere = req.body.selectedHemisphere;
      let temporaryKmlFilePath;
      let dgnFilePath = null;
      function getEPSGCode(zone: number, hemisphere: "N" | "S"): number {
        const baseEPSG = hemisphere === "N" ? 326 : 327;

        const epsgCode = baseEPSG + zone;

        return epsgCode;
      }

      const epsgCode = getEPSGCode(zone, hemisphere);

      try {
        if (!req.file) {
          console.log("No DGN file uploaded.");
          return res.status(400).json({ error: "No DGN file uploaded." });
        }

        dgnFilePath = req.file.path;
        temporaryKmlFilePath = `uploads/temp.kml`;

        const ogr2ogrCommand = `ogr2ogr -f "KML" -s_srs EPSG:${epsgCode} -t_srs EPSG:4326 ${temporaryKmlFilePath} ${dgnFilePath}`;

        //console.log("Running ogr2ogr command:", ogr2ogrCommand);

        await execPromise(ogr2ogrCommand);

        const kmlContent = await fsPromises.readFile(temporaryKmlFilePath, {
          encoding: "utf-8",
        });
        //console.log("Original KML:", kmlContent);

        res.setHeader("Content-Type", "application/xml");
        res.status(200).send(kmlContent);
      } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "An error occurred." });
      } finally {
        if (temporaryKmlFilePath) {
          try {
            await fsPromises.unlink(temporaryKmlFilePath);
            //console.log("Temporary KML file removed.");
          } catch (unlinkError) {
            console.error("Error removing temporary KML file:", unlinkError);
          }
        }
        if (dgnFilePath) {
          try {
            await fsPromises.unlink(dgnFilePath);
            //console.log("DGN file removed.");
          } catch (unlinkError) {
            console.error("Error removing DGN file:", unlinkError);
          }
        }
      }
    });
  });
};

export default handleApiRequest;
