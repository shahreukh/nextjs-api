import { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import archiver from "archiver";

const flattenGeometryCollection = (geometryCollection) => {
  if (
    geometryCollection.type === "GeometryCollection" &&
    geometryCollection.geometries
  ) {
    const polygons = geometryCollection.geometries.map((geometry) => {
      if (geometry.type === "Polygon") {
        return geometry.coordinates;
      }
      return null; // Skip other geometry types for simplicity
    });

    return {
      type: "MultiPolygon",
      coordinates: polygons.filter((polygon) => polygon !== null),
    };
  }

  return geometryCollection;
};

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
      const { kmlData } = req.body;

      console.log("Received GeoJSON data:", kmlData);

      // Flatten GeometryCollection to MultiPolygon
      const flattenedGeoJson = {
        ...kmlData,
        features: kmlData.features.map((feature) => ({
          ...feature,
          geometry: flattenGeometryCollection(feature.geometry),
        })),
      };

      const geoJsonString = JSON.stringify(flattenedGeoJson);
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

      // Log the content of the SHP files after conversion
      ogr2ogr.on("close", (code) => {
        if (code === 0) {
          // Read and log the content of the SHP files
          const shpContent = fs.readFileSync(
            path.join(tmpDirectory, "output.shp"),
            "utf-8"
          );
          const shxContent = fs.readFileSync(
            path.join(tmpDirectory, "output.shx"),
            "utf-8"
          );
          const dbfContent = fs.readFileSync(
            path.join(tmpDirectory, "output.dbf"),
            "utf-8"
          );

          console.log("SHP Content:", shpContent);
          console.log("SHX Content:", shxContent);
          console.log("DBF Content:", dbfContent);
        } else {
          console.error("ogr2ogr process exited with code", code);
        }
      });

      // Create a ZIP stream
      const archive = archiver("zip", {
        zlib: { level: 9 }, // Compression level
      });

      // Pipe the ZIP stream to the response
      archive.pipe(res);

      // Add Shapefile files to the ZIP stream
      archive.file(path.join(tmpDirectory, "output.shp"), {
        name: "output.shp",
      });
      archive.file(path.join(tmpDirectory, "output.shx"), {
        name: "output.shx",
      });
      archive.file(path.join(tmpDirectory, "output.dbf"), {
        name: "output.dbf",
      });
      // Add other related files as needed

      // Finalize the ZIP archive
      archive.finalize();

      // Cleanup: Remove temporary files
      // Note: You might want to handle cleanup differently based on your requirements
      // fs.unlinkSync(path.join(tmpDirectory, "output.shp"));
      // fs.unlinkSync(path.join(tmpDirectory, "output.shx"));
      // fs.unlinkSync(path.join(tmpDirectory, "output.dbf"));
    } catch (error) {
      console.error("Error while processing GeoJSON data:", error);
      res.status(500).json({ error: "Failed to process GeoJSON data." });
    }
  } else {
    res.status(405).json({ error: "Method not allowed." });
  }
};

export default handleSHPData;
