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

const flattenGeometryCollection = (geometryCollection) => {
  if (
    geometryCollection.type === "GeometryCollection" &&
    geometryCollection.geometries
  ) {
    const flattenedGeometries = geometryCollection.geometries.map(
      (geometry) => {
        if (geometry.type === "Polygon") {
          return {
            type: "MultiPolygon",
            coordinates: [geometry.coordinates],
          };
        } else if (geometry.type === "LineString") {
          return {
            type: "MultiLineString",
            coordinates: [geometry.coordinates],
          };
        } else {
          // Handle other geometry types if needed
          return null;
        }
      }
    );

    return {
      type: "GeometryCollection",
      geometries: flattenedGeometries.filter((g) => g !== null),
    };
  }

  return geometryCollection;
};

const findUTMZoneFromGeoJSON = (geojson) => {
  if (geojson && geojson.features && geojson.features.length > 0) {
    const firstFeature = geojson.features[0];
    const firstCoordinates = getFirstCoordinates(firstFeature.geometry);

    if (firstCoordinates) {
      const longitude = firstCoordinates[0];
      const latitude = firstCoordinates[1];
      const utmZone = Math.floor((longitude + 180) / 6) + 1;
      const hemisphereIndicator = latitude >= 0 ? "6" : "7";
      console.log(longitude, latitude, utmZone, hemisphereIndicator);
      return `EPSG:32${hemisphereIndicator}${
        utmZone > 9 ? utmZone : "0" + utmZone
      }`;
    }
  }

  return "EPSG:32737";
};

const getFirstCoordinates = (geometry) => {
  if (geometry && geometry.coordinates) {
    if (geometry.type === "Point") {
      return geometry.coordinates;
    } else if (
      geometry.type === "LineString" ||
      geometry.type === "MultiPoint"
    ) {
      return geometry.coordinates[0];
    } else if (
      geometry.type === "Polygon" ||
      geometry.type === "MultiLineString"
    ) {
      return geometry.coordinates[0][0];
    } else if (geometry.type === "MultiPolygon") {
      return geometry.coordinates[0][0][0];
    }
  }

  return null;
};

const handleDGNDataUTM = async (req: NextApiRequest, res: NextApiResponse) => {
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
      console.log(geoJsonData);
      const flattenedGeoJson = {
        ...geoJsonData,
        features: geoJsonData.features.map((feature) => ({
          ...feature,
          geometry: flattenGeometryCollection(feature.geometry),
        })),
      };

      const geoJsonString = JSON.stringify(flattenedGeoJson);
      console.log(geoJsonString);
      const uploadsDirectory = path.join(process.cwd(), "uploads_dgn");
      if (!fs.existsSync(uploadsDirectory)) {
        fs.mkdirSync(uploadsDirectory);
      }

      const targetEPSG = findUTMZoneFromGeoJSON(geoJsonData);

      const dgnFilePath = path.join(uploadsDirectory, "output.dgn");

      const ogr2ogr = spawn("ogr2ogr", [
        "-f",
        "DGN",
        "-t_srs",
        targetEPSG,
        dgnFilePath,
        "/vsistdin/",
      ]);

      console.log("ogr2ogr command:", ogr2ogr.spawnargs.join(" "));

      ogr2ogr.stdin.write(geoJsonString);
      ogr2ogr.stdin.end();

      ogr2ogr.on("close", (code) => {
        if (code === 0) {
          console.log("ogr2ogr process completed successfully.");

          if (fs.existsSync(dgnFilePath)) {
            const dgnFileContent = fs.readFileSync(dgnFilePath);

            res.setHeader("Content-Type", "application/dgn");
            res.setHeader(
              "Content-Disposition",
              "attachment; filename=output.dgn"
            );
            res.send(dgnFileContent);
          } else {
            console.error("DGN file does not exist:", dgnFilePath);
            res.status(500).json({
              error: "Failed to convert GeoJSON to dgn.",
              dgnData: null,
            });
          }
        } else {
          console.error("ogr2ogr process exited with code", code);
          res.status(500).json({
            error: "Failed to convert GeoJSON to dgn.",
            dgnData: null,
          });
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

export default handleDGNDataUTM;
