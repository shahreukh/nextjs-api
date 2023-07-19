# TFPA Surface Generator
from shapely.geometry import Polygon, LineString
from datetime import datetime
import geopandas as gpd
import pandas as pd
import tempfile
import pyproj
import fiona
import math
import sys
import os

fiona.supported_drivers['KML'] = 'rw'

# Inputs

# ICAO code of the airport
airport = sys.argv[1]

folder_name ="TFPA_Surfaces" #Name of Export Folder

# Threshold Coordinates
e1_lat = sys.argv[2]
e1_lon = sys.argv[3]
e1_elev = float(sys.argv[4])
e1_rwy = sys.argv[5]

e2_lat = sys.argv[6]
e2_lon = sys.argv[7]
e2_elev = float(sys.argv[8])
e2_rwy = sys.argv[9]

r1_lat = sys.argv[10]
r1_lon = sys.argv[11]
r1_elev = float(sys.argv[12])

r2_lat = sys.argv[13]
r2_lon = sys.argv[14]
r2_elev = float(sys.argv[15])

e1 = [e1_lat, e1_lon, e1_elev, e1_rwy]
e2 = [e2_lat, e2_lon, e2_elev, e2_rwy]

r1e = [r1_lat, r1_lon, r1_elev]
r2e = [r2_lat, r2_lon, r2_elev]

arp_lat = 415742
arp_lon = 213717
arp = [arp_lat, arp_lon] #lat,lon -- arp coordinates in DDMMSS.SS format

cwy1 = float(sys.argv[16]) #length of the cwy of rwy1
cwy2 = float(sys.argv[17]) #length of the cwy of rwy2

"""
runway_length = 2450
runway_width = 45 
runway = [runway_length, runway_width]

strip_length = 2570
strip_width = 300
strip = [strip_length, strip_width]

"""
#TFPA Inputs
l_tfpa = float(sys.argv[18])        #length of the TFPA surface
w_tfpa = float(sys.argv[19])          #lenght of the inner edge
div_tfpa = float(sys.argv[20])     #divergence
w_tfpa_final = float(sys.argv[21])   #width of takeoff surface
s_tfpa = float(sys.argv[22])       #slope of the takeoff surface

# Create Surfaces
def DDMMSS_to_UTM(lat, lon):
    lat_degrees = int(float(lat) / 10000)
    lat_minutes = int((float(lat) - lat_degrees * 10000) / 100)
    lat_seconds = float(lat) - lat_degrees * 10000 - lat_minutes * 100
    lat_decimal = lat_degrees + (lat_minutes / 60) + (lat_seconds / 3600)

    lon_degrees = int(float(lon) / 10000)
    lon_minutes = int((float(lon) - lon_degrees * 10000) / 100)
    lon_seconds = float(lon) - lon_degrees * 10000 - lon_minutes * 100
    lon_decimal = lon_degrees + (lon_minutes / 60) + (lon_seconds / 3600)

    utm_zone = int((lon_decimal + 180) / 6) + 1
    epsg_code = '326' + str(utm_zone)
    p = pyproj.Proj(init='epsg:' + epsg_code)
    utm_easting, utm_northing = p(lon_decimal, lat_decimal)
    return int(epsg_code), utm_easting, utm_northing


EPSG, e1[0], e1[1] = DDMMSS_to_UTM(e1[0], e1[1])
EPSG, e2[0], e2[1] = DDMMSS_to_UTM(e2[0], e2[1])

EPSG, r1e[0], r1e[1] = DDMMSS_to_UTM(r1e[0], r1e[1])
EPSG, r2e[0], r2e[1] = DDMMSS_to_UTM(r2e[0], r2e[1])

EPSG, arp[0], arp[1] = DDMMSS_to_UTM(arp[0], arp[1])

#sort thresholds
if e1[0] > e2[0]:
  t1 = e2 + r2e + [cwy2]
  t2 = e1 + r1e + [cwy1]

else:
  t1 = e1 + r1e + [cwy1]
  t2 = e2 + r2e + [cwy2]

t2.append(1)
t1.append(-1)

#Slope of center line in caresian coordinate system
m = (t2[1]-t1[1])/(t2[0]-t1[0])

#angle between center line and x axis
alpha = math.atan(m)
azimuth = math.degrees(math.pi/2 - alpha)

# define function to calculate new point coordinates based on distance, azimuth, and slope
def calculate_new_point(x, y, z, distance, azimuth, slope, divergence):
    """
    Calculate new point coordinates based on distance, azimuth, and slope.

    Parameters
    ----------
    x : float
        X coordinate of starting point.
    y : float
        Y coordinate of starting point.
    distance : float
        Distance between starting point and new point.
    azimuth : float
        Azimuth angle from starting point to new point in degrees.
    slope : float
        Slope angle from starting point to new point in degrees.

    Returns
    -------
    tuple
        Tuple of X and Y coordinates of new point.
    """
    # convert angles to radians
    azimuth_rad = math.radians(azimuth)
    divergence_rad = math.atan(divergence)
    azimuth_divergence = azimuth_rad + divergence_rad

    inclined_distance = distance / math.cos(divergence_rad)

    # calculate new point coordinates
    x_new = x + (inclined_distance * math.sin(azimuth_divergence))
    y_new = y + (inclined_distance * math.cos(azimuth_divergence))
    z_new = z + (distance * slope)

    return x_new, y_new, z_new

arc_degree = 1

def points_on_arc(center, start, end, elevation, direction, degree_interval = arc_degree):
    radius = math.sqrt((center[0] - start[0]) ** 2 + (center[1] - start[1]) ** 2)
    start_angle = math.atan2(start[1] - center[1], start[0] - center[0])
    end_angle = math.atan2(end[1] - center[1], end[0] - center[0])

    if direction == "ccw":
        if end_angle <= start_angle:
            end_angle += 2 * math.pi
    else:
        if end_angle >= start_angle:
            end_angle -= 2 * math.pi

    num_points = int(abs(end_angle - start_angle) / math.radians(degree_interval)) + 1
    angle_increment = (end_angle - start_angle) / (num_points - 1)

    points = []
    for i in range(num_points):
        angle = start_angle + i * angle_increment
        x = center[0] + radius * math.cos(angle)
        y = center[1] + radius * math.sin(angle)
        points.append((x, y, elevation))

    return points


def create_strip(t1,t2,runway,strip,azimuth):

  w = strip[1]
  d = (strip[0] - runway[0])/2

  s1 = calculate_new_point(t1[4],t1[5],t1[6],w/2,azimuth-90,0,0)
  s2 = calculate_new_point(t1[4],t1[5],t1[6],d,azimuth,0,-w/2/d)
  s3 = calculate_new_point(t1[4],t1[5],t1[6],d,azimuth,0,w/2/d)
  s4 = calculate_new_point(t1[4],t1[5],t1[6],w/2,azimuth+90,0,0)

  s5 = calculate_new_point(t2[4],t2[5],t2[6],w/2,azimuth-180-90,0,0)
  s6 = calculate_new_point(t2[4],t2[5],t2[6],d,azimuth-180,0,-w/2/d)
  s7 = calculate_new_point(t2[4],t2[5],t2[6],d,azimuth-180,0,w/2/d)
  s8 = calculate_new_point(t2[4],t2[5],t2[6],w/2,azimuth-180+90,0,0)

  return [s1,s2,s3,s4,s5,s6,s7,s8,s1]

def tfpa(t,w,l,w_f,s,div,azimuth):

  if t[-1] < 0:
    azimuth_tfpa =  azimuth
  else:
    azimuth_tfpa =  azimuth - 180

  d = t[7]

  if d == 0:
    d = 0.001

  l1 = (w_f-w)/2/div
  l2 = l-l1

  #left side
  a1 = calculate_new_point(t[4],t[5],t[6],d,azimuth_tfpa,0,-w/2/d)
  a2 = calculate_new_point(a1[0],a1[1],a1[2],l1,azimuth_tfpa,s,-div)
  a3 = calculate_new_point(a2[0],a2[1],a2[2],l2,azimuth_tfpa,s,0)


  #right side
  a4 = calculate_new_point(t[4],t[5],t[6],d,azimuth_tfpa,0,w/2/d)
  a5 = calculate_new_point(a4[0],a4[1],a4[2],l1,azimuth_tfpa,s,div)
  a6 = calculate_new_point(a5[0],a5[1],a5[2],l2,azimuth_tfpa,s,0)

  return [a1,a2,a3,a6,a5,a4,a1]
def export_surfaces(coordinates, annex, surface_name):
    geom = []
    for i in coordinates:
        geom.append(Polygon(i))
    gdf_surface = gpd.GeoDataFrame(geometry=geom, crs=str(EPSG))

    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()
    # Split the surface name into parts using specific delimiters
    extracted_part = surface_name
    # Set the file name without suffix
    temp_file_name = extracted_part
    # Construct the full path of the temporary file
    temp_file_path = os.path.join(temp_dir, temp_file_name)
    # Export GeoDataFrame to KML file
    gdf_surface.to_crs(epsg=4326).to_file(temp_file_path, driver='KML')
    # Read the contents of the KML file
    with open(temp_file_path, 'r') as f:
        kml_data = f.read()
    # Print the KML data
    print(kml_data)
    # Delete the temporary file and directory
    os.remove(temp_file_path)
    os.rmdir(temp_dir)

"""
    if not os.path.exists(folder_name):
        os.makedirs(folder_name)
    
    airport_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")  # Get current timestamp for airport directory
    airport_directory = folder_name + "/" + airport + "_" + airport_timestamp

    if not os.path.exists(airport_directory):
        os.makedirs(airport_directory)
    if not os.path.exists(airport_directory+"/"+annex):
        os.makedirs(airport_directory+"/"+annex)
    if not os.path.exists(airport_directory+"/"+annex+"/UTM"):
        os.makedirs(airport_directory+"/"+annex+"/UTM")
    if not os.path.exists(airport_directory+"/"+annex+"/Geographic"):
        os.makedirs(airport_directory+"/"+annex+"/Geographic")
    if not os.path.exists(airport_directory+"/"+annex+"/KML"):
        os.makedirs(airport_directory+"/"+annex+"/KML")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")  # Get current timestamp
    file_name = airport + "_" + surface_name + "_" + timestamp

    gdf_surface.to_file(airport_directory+"/"+annex+"/UTM/"+file_name+'_Epsg'+str(EPSG)+'.shp')  # utm shp
    gdf_surface.to_crs(4326).to_file(airport_directory+"/"+annex+"/Geographic/"+file_name+'_Epsg4326.shp')  # geographic shp
    gdf_surface.to_crs(4326).to_file(airport_directory+"/"+annex+"/KML/"+file_name+'_Epsg4326.kml', driver='KML')  # geographic kml
"""
#create coordinates of surfaces
tfpa1 = [tfpa(t1,w_tfpa,l_tfpa,w_tfpa_final,s_tfpa,div_tfpa,azimuth)]
tfpa2 = [tfpa(t2,w_tfpa,l_tfpa,w_tfpa_final,s_tfpa,div_tfpa,azimuth)]
annex4 = "Annex4"
export_surfaces(tfpa1,annex4,"TFPA_RWY"+t1[3])
export_surfaces(tfpa2,annex4,"TFPA_RWY"+t2[3])

#zip
#shutil.make_archive(folder_name, 'zip', folder_name)