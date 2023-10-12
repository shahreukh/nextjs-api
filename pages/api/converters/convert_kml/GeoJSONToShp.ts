import { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import archiver from "archiver";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "40mb",
    },
  },
};

const flattenGeometryCollection = (geometryCollection) => {
  if (
    geometryCollection.type === "GeometryCollection" &&
    geometryCollection.geometries
  ) {
    const flattenedGeometries = geometryCollection.geometries.map(
      (geometry) => {
        switch (geometry.type) {
          case "Polygon":
            return {
              type: "MultiPolygon",
              coordinates: [geometry.coordinates],
            };
          case "MultiPolygon":
          case "LineString":
          case "MultiLineString":
          case "Point":
          case "MultiPoint":
            return geometry;
          default:
            return null;
        }
      }
    );

    return {
      type: "GeometryCollection",
      geometries: flattenedGeometries.filter((geometry) => geometry !== null),
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
      const { geoJsonData } = req.body;

      // console.log("Received GeoJSON data:", geoJsonData);

      const flattenedGeoJson = {
        ...geoJsonData,
        features: geoJsonData.features.map((feature) => ({
          ...feature,
          geometry: flattenGeometryCollection(feature.geometry),
        })),
      };

      const geoJsonString = JSON.stringify(flattenedGeoJson);
      console.log(geoJsonString);

      const uploadsDirectory = path.join(process.cwd(), "uploads_shp");
      if (!fs.existsSync(uploadsDirectory)) {
        fs.mkdirSync(uploadsDirectory);
      }

      const ogr2ogr = spawn("ogr2ogr", [
        "-f",
        "ESRI Shapefile",
        path.join(uploadsDirectory, "output.shp"),
        "/vsistdin/",
      ]);

      console.log("ogr2ogr command:", ogr2ogr.spawnargs.join(" "));

      ogr2ogr.stdin.write(geoJsonString);
      ogr2ogr.stdin.end();

      // Log the content of the SHP files after conversion
      ogr2ogr.on("close", (code) => {
        if (code === 0) {
          console.log("ogr2ogr process completed successfully.");

          // Create a ZIP stream
          const archive = archiver("zip", {
            zlib: { level: 9 },
          });

          // Pipe the ZIP stream to the response
          archive.pipe(res);

          // Add Shapefile files to the ZIP stream from the "uploads" directory
          archive.file(path.join(uploadsDirectory, "output.shp"), {
            name: "output.shp",
          });
          archive.file(path.join(uploadsDirectory, "output.shx"), {
            name: "output.shx",
          });
          archive.file(path.join(uploadsDirectory, "output.dbf"), {
            name: "output.dbf",
          });
          archive.file(path.join(uploadsDirectory, "output.prj"), {
            name: "output.prj",
          });
          // Add other related files as needed

          // Finalize the ZIP archive
          archive.finalize();

          // Cleanup: Remove temporary files
          archive.on("finish", () => {
            fs.unlinkSync(path.join(uploadsDirectory, "output.shp"));
            fs.unlinkSync(path.join(uploadsDirectory, "output.shx"));
            fs.unlinkSync(path.join(uploadsDirectory, "output.dbf"));
            fs.unlinkSync(path.join(uploadsDirectory, "output.prj"));
          });
        } else {
          console.error("ogr2ogr process exited with code", code);
          res.status(500).json({ error: "Failed to convert GeoJSON to SHP." });
        }
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
