import { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import multer from "multer";
import { exec } from "child_process";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), "uploads/uploads_shp"));
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "40mb",
    },
  },
};

function getEPSGCode(zone: number, hemisphere: "N" | "S"): number {
  const baseEPSG = hemisphere === "N" ? 326 : 327;
  const epsgCode = baseEPSG + zone;
  return epsgCode;
}

const handleUpload = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  try {
    upload.any()(req, res, async (err) => {
      if (err) {
        console.error("Error uploading file:", err);
        res.status(500).json({ error: "Failed to upload file" });
      } else {
        try {
          const { selectedZone, selectedHemisphere } = req.body;

          if (selectedZone === undefined || selectedHemisphere === undefined) {
            res.status(400).json({
              error: "selectedZone and selectedHemisphere are required",
            });
            return;
          }

          const epsgCode = getEPSGCode(selectedZone, selectedHemisphere);

          const shpFile = req.files.find((file) =>
            file.originalname.endsWith(".shp")
          );

          if (!shpFile) {
            res.status(400).json({ error: "Missing SHP file" });
            return;
          }

          const outputGeoJSONFile = path.join(
            process.cwd(),
            "uploads/uploads_shp",
            "output.geojson"
          );

          const ogr2ogrCommand = `ogr2ogr -f "GeoJSON" -s_srs EPSG:${epsgCode} -t_srs EPSG:4326 ${outputGeoJSONFile} ${shpFile.path}`;

          exec(ogr2ogrCommand, (error, stdout, stderr) => {
            if (error) {
              console.error("Error converting to GeoJSON:", error);
              res.status(500).json({ error: "Failed to convert to GeoJSON" });
            } else {
              res.status(200).json({
                message:
                  "Files uploaded and converted to WGS84 GeoJSON successfully",
              });
            }
          });
        } catch (error) {
          console.error("Error processing files:", error);
          res
            .status(500)
            .json({ error: "An error occurred during processing" });
        }
      }
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
};

export default handleUpload;
