import { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import archiver from "archiver";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

const flattenGeometryCollection = (geometryCollection) => {
  // Check if the input is a GeometryCollection and has geometries
  if (
    geometryCollection.type === "GeometryCollection" &&
    geometryCollection.geometries
  ) {
    // Map over each geometry in the collection
    const flattenedGeometries = geometryCollection.geometries.map(
      (geometry) => {
        // Switch based on the type of the individual geometry
        switch (geometry.type) {
          // If the geometry is a Polygon, convert it to MultiPolygon
          case "Polygon":
            return {
              type: "MultiPolygon",
              coordinates: [geometry.coordinates],
            };
          // If the geometry is a LineString, convert it to MultiLineString
          case "LineString":
            return {
              type: "MultiLineString",
              coordinates: [geometry.coordinates],
            };
          // If the geometry is a MultiPolygon, MultiLineString, or Point, leave it unchanged
          case "MultiPolygon":
          case "MultiLineString":
          case "Point":
            return geometry;
          // If the geometry is of an unknown type, return null
          default:
            return null;
        }
      }
    );

    // Filter out any null values (unknown geometry types) from the result
    return {
      type: "GeometryCollection",
      geometries: flattenedGeometries.filter((geometry) => geometry !== null),
    };
  }

  // If the input is not a GeometryCollection, return it unchanged
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
      const uploadsDirectory = path.join(process.cwd(), "uploads_shp");

      const flattenedGeoJson = {
        ...geoJsonData,
        features: geoJsonData.features.map((feature) => ({
          ...feature,
          geometry: flattenGeometryCollection(feature.geometry),
        })),
      };

      const ogr2ogrPromises = flattenedGeoJson.features.map(async (feature) => {
        const individualGeoJson = {
          type: "FeatureCollection",
          features: [feature],
        };

        const individualGeoJsonString = JSON.stringify(individualGeoJson);

        const outputFileName = `output_${feature.geometry.type.toLowerCase()}.shp`;

        return new Promise((resolve, reject) => {
          const ogr2ogr = spawn("ogr2ogr", [
            "-f",
            "ESRI Shapefile",
            path.join(uploadsDirectory, outputFileName),
            "/vsistdin/",
          ]);

          ogr2ogr.stdin.write(individualGeoJsonString);
          ogr2ogr.stdin.end();

          ogr2ogr.on("close", (code) => {
            if (code === 0) {
              console.log(
                `ogr2ogr process for ${feature.geometry.type} completed successfully.`
              );
              resolve(outputFileName);
            } else {
              console.error(
                `ogr2ogr process for ${feature.geometry.type} exited with code`,
                code
              );
              reject(
                `Failed to convert GeoJSON to SHP for ${feature.geometry.type}.`
              );
            }
          });
        });
      });

      Promise.all(ogr2ogrPromises)
        .then((outputFileNames) => {
          const archive = archiver("zip", {
            zlib: { level: 9 },
          });

          archive.pipe(res);

          for (const outputFileName of outputFileNames) {
            archive.file(path.join(uploadsDirectory, outputFileName), {
              name: outputFileName,
            });
          }

          archive.finalize();

          // Cleanup: Remove temporary files
          archive.on("finish", () => {
            for (const outputFileName of outputFileNames) {
              fs.unlinkSync(path.join(uploadsDirectory, outputFileName));
            }
          });
        })
        .catch((error) => {
          console.error("Error while processing GeoJSON data:", error);
          res.status(500).json({ error: "Failed to process GeoJSON data." });
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
