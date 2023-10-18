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

interface Geometry {
  type: string;
  coordinates: any;
}

interface GeometryCollection {
  type: string;
  geometries: Geometry[];
}

const flattenGeometryCollection = (
  geometryCollection: GeometryCollection
): GeometryCollection => {
  if (
    geometryCollection.type === "GeometryCollection" &&
    geometryCollection.geometries
  ) {
    const polygons: any[] = [];
    const lines: any[] = [];
    const points: any[] = [];

    geometryCollection.geometries.forEach((geometry) => {
      if (geometry.type === "Polygon") {
        polygons.push(geometry.coordinates);
      } else if (geometry.type === "LineString") {
        lines.push(geometry.coordinates);
      } else if (geometry.type === "Point") {
        points.push(geometry.coordinates);
      }
    });

    const flattenedGeometry: GeometryCollection = {
      type: "GeometryCollection",
      geometries: [],
    };

    if (polygons.length > 0) {
      flattenedGeometry.geometries.push({
        type: "MultiPolygon",
        coordinates: polygons,
      });
    }

    if (lines.length > 0) {
      flattenedGeometry.geometries.push({
        type: "MultiLineString",
        coordinates: lines,
      });
    }

    if (points.length > 0) {
      flattenedGeometry.geometries.push({
        type: "MultiPoint",
        coordinates: points,
      });
    }

    return flattenedGeometry;
  }

  return geometryCollection;
};

const convertToShapefile = async (features, fileName, geometryType) => {
  if (features.length === 0) {
    return; // No features of this type, nothing to convert
  }

  const typeSpecificGeoJson = {
    type: "FeatureCollection",
    features,
  };

  const typeSpecificGeoJsonString = JSON.stringify(
    flattenGeometryCollection(typeSpecificGeoJson)
  );

  const uploadsDirectory = path.join(process.cwd(), "uploads_shp");
  if (!fs.existsSync(uploadsDirectory)) {
    fs.mkdirSync(uploadsDirectory);
  }

  const ogr2ogrProcess = spawn("ogr2ogr", [
    "-f",
    "ESRI Shapefile",
    path.join(uploadsDirectory, fileName),
    "/vsistdin/",
  ]);

  ogr2ogrProcess.stdin.write(typeSpecificGeoJsonString);
  ogr2ogrProcess.stdin.end();

  return new Promise((resolve, reject) => {
    ogr2ogrProcess.on("close", (code) => {
      if (code === 0) {
        console.log(`${fileName} conversion successful.`);
        resolve();
      } else {
        console.error(`${fileName} conversion failed with code ${code}`);
        reject(new Error(`Failed to convert ${fileName} to SHP.`));
      }
    });
  });
};

const handleSHPData = async (req: NextApiRequest, res: NextApiResponse) => {
  const uploadsDirectory = path.join(process.cwd(), "uploads_shp");

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

      const flattenedGeoJson = flattenGeometryCollection(geoJsonData);
      const geoJsonString = JSON.stringify(flattenedGeoJson);
      console.log(geoJsonString);
      const pointFeatures = flattenedGeoJson.features.filter(
        (feature) => feature.geometry.type === "Point"
      );
      const lineFeatures = flattenedGeoJson.features.filter(
        (feature) => feature.geometry.type === "LineString"
      );
      const polygonFeatures = flattenedGeoJson.features.filter(
        (feature) => feature.geometry.type === "Polygon"
      );

      await Promise.all([
        convertToShapefile(pointFeatures, "output_point.shp", "Point"),
        convertToShapefile(lineFeatures, "output_line.shp", "LineString"),
        convertToShapefile(polygonFeatures, "output_polygon.shp", "Polygon"),
      ]);

      // Create a ZIP stream
      const archive = archiver("zip", {
        zlib: { level: 9 },
      });

      // Pipe the ZIP stream to the response
      archive.pipe(res);

      // Add Shapefile files to the ZIP stream from the "uploads" directory
      const shapefileFiles = [
        "output_point.shp",
        "output_point.shx",
        "output_point.dbf",
        "output_point.prj",
        "output_line.shp",
        "output_line.shx",
        "output_line.dbf",
        "output_line.prj",
        "output_polygon.shp",
        "output_polygon.shx",
        "output_polygon.dbf",
        "output_polygon.prj",
        // Add other related files as needed
      ];

      shapefileFiles.forEach((file) => {
        const filePath = path.join(uploadsDirectory, file);

        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: file });
        } else {
          console.error(`File not found: ${filePath}`);
        }
      });

      // Finalize the ZIP archive
      archive.finalize();

      // Cleanup: Remove temporary files
      archive.on("finish", () => {
        shapefileFiles.forEach((file) => {
          const filePath = path.join(uploadsDirectory, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
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
