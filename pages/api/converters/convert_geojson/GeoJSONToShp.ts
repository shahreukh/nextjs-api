import { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { spawn } from "child_process";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
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

const flattenGeoJson = (geoJson) => {
  const flattenedFeatures = [];
  for (const feature of geoJson.features) {
    const geometries = feature.geometry.geometries;
    if (geometries) {
      // Handle nested geometries and create separate features
      for (const geometry of geometries) {
        flattenedFeatures.push({
          type: "Feature",
          geometry: geometry,
          properties: feature.properties,
        });
      }
    } else {
      // If no nested geometries, use the original feature
      flattenedFeatures.push(feature);
    }
  }

  return { type: "FeatureCollection", features: flattenedFeatures };
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

  const uploadsDirectory = path.join(process.cwd(), "uploads/uploads_shp");
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

  return new Promise<void>((resolve, reject) => {
    ogr2ogrProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error(`${fileName} conversion failed with code ${code}`);
        reject(new Error(`Failed to convert ${fileName} to SHP.`));
      }
    });
  });
};

const handleSHPData = async (req: NextApiRequest, res: NextApiResponse) => {
  const uploadsDirectory = path.join(process.cwd(), "uploads/uploads_shp");

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method === "POST") {
    try {
      const { geoJsonData, fileName } = req.body;

      const flattenedGeoJson = flattenGeoJson(geoJsonData);

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
        convertToShapefile(pointFeatures, `${fileName}_point.shp`, "Point"),
        convertToShapefile(lineFeatures, `${fileName}_line.shp`, "LineString"),
        convertToShapefile(
          polygonFeatures,
          `${fileName}_polygon.shp`,
          "Polygon"
        ),
      ]);

      // Create a ZIP stream
      const archive = archiver("zip", {
        zlib: { level: 9 },
      });

      // Pipe the ZIP stream to the response
      archive.pipe(res);

      // Add Shapefile files to the ZIP stream from the "uploads" directory
      const shapefileFiles = [
        `${fileName}_point.shp`,
        `${fileName}_point.shx`,
        `${fileName}_point.dbf`,
        `${fileName}_point.prj`,
        `${fileName}_line.shp`,
        `${fileName}_line.shx`,
        `${fileName}_line.dbf`,
        `${fileName}_line.prj`,
        `${fileName}_polygon.shp`,
        `${fileName}_polygon.shx`,
        `${fileName}_polygon.dbf`,
        `${fileName}_polygon.prj`,
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

      archive.on("end", () => {
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
