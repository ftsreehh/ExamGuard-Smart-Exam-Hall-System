# ExamGuard – Smart Exam Hall Monitoring System

An IoT-based Smart Examination Hall Monitoring System that combines embedded hardware, web technologies, and database management to improve examination hall monitoring.

## 1. Project Overview

ExamGuard is designed to monitor examination hall activities using IoT technology.

An ESP32-based monitoring device detects noise disturbances and communicates with a Python Flask backend through Wi-Fi.

Administrators can monitor examination halls through a web dashboard, while invigilators can use a mobile-friendly Progressive Web App (PWA) to manage student attendance.

## 2. Problem Statement

Traditional examination halls depend heavily on manual supervision.

Common challenges include:
- Difficulty detecting noise disturbances continuously.
- Delayed reporting of examination hall incidents.
- Manual student attendance management.
- Difficulty monitoring examination schedules.
- Lack of centralized examination monitoring.

ExamGuard aims to address these challenges through IoT-based monitoring and a centralized web application.

## 3. Key Features

- Real-time noise detection using ESP32.
- Automatic noise alerts.
- OLED display for examination information.
- Exam countdown and timing display.
- Admin dashboard.
- Examination hall management.
- Examination schedule management.
- Student registration and management.
- QR/barcode-based student attendance.
- Mobile-friendly Invigilator PWA.
- Attendance history.
- Alert history and monitoring.

## 4. Technologies Used

| Technology | Purpose |
|---|---|
| ESP32 | IoT microcontroller |
| Arduino C++ | ESP32 firmware |
| Arduino IDE | Firmware development |
| Python | Backend programming |
| Flask | REST API |
| MySQL | Database |
| SQLAlchemy | Database ORM |
| HTML5 | Frontend structure |
| CSS3 | Styling |
| JavaScript | Frontend functionality |
| Bootstrap 5 | Responsive UI |
| Progressive Web App | Invigilator mobile interface |
| U8g2 | OLED display library |

## 5. System Architecture

ExamGuard consists of three main layers.

### Hardware Layer
- ESP32 microcontroller
- HW-484 digital sound sensor
- SH1106 OLED display
- Buzzer
- Red LED
- Green LED

### Backend Layer
- Python Flask server
- REST API endpoints
- MySQL database
- Noise event processing
- Attendance management
- Authentication

### Frontend Layer
- Administrator dashboard
- Invigilator PWA
- Student management
- Examination management
- Hall management
- Alert monitoring

### Communication Flow

1. Sound sensor detects noise.
2. ESP32 processes the sensor input.
3. ESP32 sends event information through Wi-Fi.
4. Flask receives and processes the information.
5. MySQL stores the relevant records.
6. Admin dashboard displays monitoring information and alerts.

The Invigilator PWA communicates with Flask APIs to retrieve examinations and record student attendance.

## 6. IoT Implementation – ESP32

The IoT firmware is developed using Arduino C++.

### Implemented Functions

- Reads digital input from the HW-484 sound sensor.
- Detects noise disturbances.
- Activates the red LED and buzzer during noise detection.
- Uses the green LED to indicate normal status.
- Displays examination information on the OLED.
- Displays remaining examination time.
- Connects ESP32 to Wi-Fi.
- Communicates with the Flask REST API.
- Sends noise events to the backend.
- Supports repeated-noise detection for high-priority alerts.

### ESP32 Pin Configuration

| Component | GPIO |
|---|---|
| Sound Sensor | GPIO 27 |
| Green LED | GPIO 25 |
| Red LED | GPIO 26 |
| Buzzer | GPIO 18 |
| OLED SDA | GPIO 21 |
| OLED SCK/SCL | GPIO 22 |

### OLED Display

The SH1106 128x64 OLED displays:
- ExamGuard branding
- Examination hall information
- Examination title
- Subject information
- Remaining examination time
- Noise warning messages

### IoT Communication

ESP32 communicates with the Flask backend using Wi-Fi and HTTP API requests.

```text
Sound Sensor
     |
     v
ESP32 Microcontroller
     |
     v
Wi-Fi Communication
     |
     v
Flask REST API
     |
     v
MySQL Database
     |
     v
Admin Dashboard
     |
     v
Alert Monitoring
