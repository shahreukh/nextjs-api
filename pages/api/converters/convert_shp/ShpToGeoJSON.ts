import { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
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
    bodyParser: false,
  },
};

const handleUpload = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  try {
    upload.array("shpFiles")(req, res, async (err) => {
      if (err) {
        console.error("Error uploading file:", err);
        res.status(500).json({ error: "Failed to upload file" });
      } else {
        try {
          // Filter the files to keep only .shp, .shx, and .dbf files
          const allowedFileTypes = [".shp", ".shx", ".dbf"];
          const filteredFiles = req.files.filter((file) =>
            allowedFileTypes.some((ext) => file.originalname.endsWith(ext))
          );

          if (filteredFiles.length !== allowedFileTypes.length) {
            res.status(400).json({ error: "Required files are missing" });
            return;
          }

          const shpFile = filteredFiles.find((file) =>
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

          const ogr2ogrCommand = `ogr2ogr -f "GeoJSON" ${outputGeoJSONFile} ${shpFile.path}`;

          exec(ogr2ogrCommand, (error, stdout, stderr) => {
            if (error) {
              console.error("Error converting to GeoJSON:", error);
              res.status(500).json({ error: "Failed to convert to GeoJSON" });
            } else {
              // Read the converted GeoJSON file
              // Inside the fs.readFile callback, after sending the GeoJSON response
              fs.readFile(outputGeoJSONFile, "utf8", (readError, data) => {
                if (readError) {
                  console.error("Error reading GeoJSON file:", readError);
                  res
                    .status(500)
                    .json({ error: "Failed to read GeoJSON file" });
                } else {
                  // Send the GeoJSON as the response
                  res.status(200).json(JSON.parse(data)); // Parse the GeoJSON data and send it

                  // Delete the uploaded files
                  fs.unlink(shpFile.path, (unlinkError) => {
                    if (unlinkError) {
                      console.error(
                        "Error deleting uploaded .shp file:",
                        unlinkError
                      );
                    }
                  });

                  // Delete .shx and .dbf files
                  const shxFile = filteredFiles.find((file) =>
                    file.originalname.endsWith(".shx")
                  );
                  if (shxFile) {
                    fs.unlink(shxFile.path, (unlinkError) => {
                      if (unlinkError) {
                        console.error(
                          "Error deleting uploaded .shx file:",
                          unlinkError
                        );
                      }
                    });
                  }

                  const dbfFile = filteredFiles.find((file) =>
                    file.originalname.endsWith(".dbf")
                  );
                  if (dbfFile) {
                    fs.unlink(dbfFile.path, (unlinkError) => {
                      if (unlinkError) {
                        console.error(
                          "Error deleting uploaded .dbf file:",
                          unlinkError
                        );
                      }
                    });
                  }

                  fs.unlink(outputGeoJSONFile, (unlinkError) => {
                    if (unlinkError) {
                      console.error(
                        "Error deleting GeoJSON file:",
                        unlinkError
                      );
                    }
                  });
                }
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
