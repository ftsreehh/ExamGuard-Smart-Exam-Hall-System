/*
============================================================
                    EXAMGUARD
             SMART EXAM HALL MONITORING
============================================================

HARDWARE:
ESP32
SH1106 OLED 128x64
HW-484 Digital Sound Sensor
Green LED
Red LED
Buzzer

FEATURES:
1. WiFi connection
2. Flask API communication
3. Exam schedule retrieval
4. IST clock synchronization
5. Exam countdown
6. Noise monitoring during exams only
7. Single noise warning
8. High noise after 5 detections within 10 seconds
9. Offline high-noise alert storage
10. WiFi reconnection
11. Final 30-second countdown
12. One beep every second during final 30 seconds
13. Exam completion and stop detection
14. Robot animation
15. Serial debugging

============================================================
*/


#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <Preferences.h>
#include <time.h>
#include <sys/time.h>


// ==========================================================
// 1. WIFI SETTINGS
// ==========================================================

const char* WIFI_SSID = "";

const char* WIFI_PASSWORD = "";


// ==========================================================
// 2. FLASK API
// ==========================================================

const char* EXAM_API =
"http://10.160.189.132:5000/api/exams/device/1";

const char* NOISE_ALERT_API =
"http://10.160.189.132:5000/api/noise/repeated-alert";

const int HALL_ID = 1;

const int DEVICE_ID = 1;


// ==========================================================
// 3. HARDWARE PINS
// ==========================================================

#define SOUND_PIN 27

#define GREEN_LED 25

#define RED_LED 26

#define BUZZER_PIN 18

#define OLED_SDA 21

#define OLED_SCK 22


// ==========================================================
// 4. SENSOR CONFIGURATION
// ==========================================================

// HW-484 is normally active LOW.
// Change to HIGH if your module behaves oppositely.

#define SOUND_ACTIVE_LEVEL LOW

const unsigned long SENSOR_POLL_INTERVAL = 1;

const unsigned long SENSOR_DEBOUNCE_MS = 200;


// HIGH NOISE SETTINGS

const int HIGH_NOISE_LIMIT = 5;

const unsigned long NOISE_WINDOW_MS = 10000;


// ==========================================================
// 5. OLED
// ==========================================================

U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(
  U8G2_R0,
  U8X8_PIN_NONE
);


// ==========================================================
// 6. PREFERENCES
// ==========================================================

Preferences preferences;


// ==========================================================
// 7. TIMING
// ==========================================================

const unsigned long WIFI_RETRY_INTERVAL = 5000;

const unsigned long API_INTERVAL = 15000;

const unsigned long DISPLAY_INTERVAL = 100;

const unsigned long ALERT_RETRY_INTERVAL = 5000;


// ==========================================================
// 8. CONNECTION STATUS
// ==========================================================

bool wifiConnected = false;

bool flaskConnected = false;

unsigned long lastWifiAttempt = 0;

unsigned long lastSuccessfulApi = 0;

unsigned long lastScheduleFetch = 0;

unsigned long lastAlertRetry = 0;


// ==========================================================
// 9. EXAM INFORMATION
// ==========================================================

int currentExamId = -1;

String hallCode = "HALL-A01";

String hallName = "Examination Hall";

String examTitle = "Waiting for exam";

String examSubject = "";

String examStatus = "WAITING";

String examStartTime = "";

String examEndTime = "";

bool examActive = false;

bool examCompleted = false;

bool examStopped = false;


// Countdown is based on the last server value.

long remainingSeconds = 0;

long countdownBaseSeconds = 0;

unsigned long countdownAnchorMillis = 0;


// ==========================================================
// 10. SENSOR STATUS
// ==========================================================

bool sensorEnabled = false;

bool previousSensorActive = false;

unsigned long lastSensorPoll = 0;

unsigned long lastDetectionTime = 0;

unsigned long lastNoiseDetected = 0;


// Noise detection timestamps.

unsigned long noiseTimes[HIGH_NOISE_LIMIT] = {0};

int noiseIndex = 0;

int noiseCount = 0;

bool highNoiseAlertSent = false;


// ==========================================================
// 11. OFFLINE ALERT STORAGE
// ==========================================================

unsigned long pendingNoiseDetections = 0;


// ==========================================================
// 12. DISPLAY MODES
// ==========================================================

enum DisplayMode {

  DISPLAY_WIFI,

  DISPLAY_WAITING,

  DISPLAY_STARTED,

  DISPLAY_DETAILS,

  DISPLAY_COUNTDOWN,

  DISPLAY_ROBOT,

  DISPLAY_NOISE,

  DISPLAY_HIGH_NOISE,

  DISPLAY_COMPLETED,

  DISPLAY_STOPPED

};

DisplayMode displayMode = DISPLAY_WIFI;

unsigned long displayModeStarted = 0;

unsigned long lastDisplayUpdate = 0;

unsigned long lastSlideChange = 0;

int slideNumber = 1;


// ==========================================================
// 13. BUZZER QUEUE
// ==========================================================

struct BeepEvent {

  int count;

  int duration;

  int gap;

};

const int BEEP_QUEUE_SIZE = 64;

BeepEvent beepQueue[BEEP_QUEUE_SIZE];

int beepHead = 0;

int beepTail = 0;

bool buzzerPlaying = false;

int currentBeepCount = 0;

int currentBeepDuration = 0;

int currentBeepGap = 0;

int currentBeepIndex = 0;

int buzzerPhase = 0;

unsigned long buzzerTimer = 0;


// ==========================================================
// 14. FINAL COUNTDOWN
// ==========================================================

bool finalCountdownActive = false;

int lastFinalCountdownBeep = -1;

unsigned long finalLedTimer = 0;

bool finalLedState = false;


// ==========================================================
// 15. LED TIMERS
// ==========================================================

unsigned long highLedTimer = 0;

bool highLedState = false;


// ==========================================================
// 16. BUZZER QUEUE FUNCTION
// ==========================================================

void addBeep(int count, int duration, int gap) {

  int next = (beepTail + 1) % BEEP_QUEUE_SIZE;

  if (next == beepHead) {

    Serial.println("WARNING: Buzzer queue full");

    return;
  }

  beepQueue[beepTail].count = count;

  beepQueue[beepTail].duration = duration;

  beepQueue[beepTail].gap = gap;

  beepTail = next;

}


// ==========================================================
// 17. NON-BLOCKING BUZZER
// ==========================================================

void serviceBuzzer() {

  unsigned long now = millis();

  // Start a new pattern.

  if (!buzzerPlaying) {

    if (beepHead == beepTail) {

      digitalWrite(BUZZER_PIN, LOW);

      return;
    }

    BeepEvent event = beepQueue[beepHead];

    beepHead = (beepHead + 1) % BEEP_QUEUE_SIZE;

    currentBeepCount = event.count;

    currentBeepDuration = event.duration;

    currentBeepGap = event.gap;

    currentBeepIndex = 0;

    buzzerPlaying = true;

    buzzerPhase = 1;

    buzzerTimer = now;

    digitalWrite(BUZZER_PIN, HIGH);

    return;
  }


  // Phase 1: Buzzer ON.

  if (buzzerPhase == 1) {

    if (now - buzzerTimer >= currentBeepDuration) {

      digitalWrite(BUZZER_PIN, LOW);

      buzzerTimer = now;

      buzzerPhase = 2;

      currentBeepIndex++;

    }

  }


  // Phase 2: Buzzer OFF.

  else if (buzzerPhase == 2) {

    if (currentBeepIndex >= currentBeepCount) {

      buzzerPlaying = false;

      digitalWrite(BUZZER_PIN, LOW);

      return;

    }

    if (now - buzzerTimer >= currentBeepGap) {

      digitalWrite(BUZZER_PIN, HIGH);

      buzzerTimer = now;

      buzzerPhase = 1;

    }

  }

}


// ==========================================================
// 18. SENSOR CONTROL
// ==========================================================

void enableNoiseSensor() {

  if (sensorEnabled) {
    return;
  }

  sensorEnabled = true;

  previousSensorActive = false;

  lastDetectionTime = 0;

  lastNoiseDetected = 0;

  noiseCount = 0;

  noiseIndex = 0;

  highNoiseAlertSent = false;

  for (int i = 0; i < HIGH_NOISE_LIMIT; i++) {
    noiseTimes[i] = 0;
  }

  Serial.println("================================");

  Serial.println("NOISE SENSOR ENABLED");

  Serial.println("Monitoring during examination");

  Serial.println("================================");

}


void disableNoiseSensor() {

  sensorEnabled = false;

  previousSensorActive = false;

  noiseCount = 0;

  noiseIndex = 0;

  highNoiseAlertSent = false;

  Serial.println("NOISE SENSOR DISABLED");

}


// ==========================================================
// 19. OFFLINE STORAGE
// ==========================================================

void loadPendingAlerts() {

  preferences.begin("examguard", false);

  pendingNoiseDetections =
    preferences.getULong("pending", 0);

  Serial.print("Stored offline detections: ");

  Serial.println(pendingNoiseDetections);

}


void savePendingAlerts() {

  preferences.putULong(
    "pending",
    pendingNoiseDetections
  );

}


void storeOfflineNoiseAlert(unsigned long detections) {

  pendingNoiseDetections += detections;

  savePendingAlerts();

  Serial.print("Offline alerts stored: ");

  Serial.println(pendingNoiseDetections);

}


// ==========================================================
// 20. SEND HIGH NOISE ALERT
// ==========================================================

bool sendRepeatedNoiseAlert(unsigned long detections) {

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi unavailable. Saving alert.");

    storeOfflineNoiseAlert(detections);

    return false;
  }

  HTTPClient http;

  http.setTimeout(3000);

  http.begin(NOISE_ALERT_API);

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  JsonDocument doc;

  doc["hall_id"] = HALL_ID;

  doc["device_id"] = DEVICE_ID;

  doc["detections"] = detections;

  doc["window_seconds"] = 10;

  String payload;

  serializeJson(doc, payload);

  Serial.println("Sending high-noise alert to Flask:");

  Serial.println(payload);

  int response = http.POST(payload);

  String responseBody = http.getString();

  http.end();

  Serial.print("HTTP response: ");

  Serial.println(response);

  Serial.println(responseBody);

  if (response >= 200 && response < 300) {

    flaskConnected = true;

    lastSuccessfulApi = millis();

    Serial.println("HIGH NOISE ALERT SENT SUCCESSFULLY");

    return true;
  }

  Serial.println("Alert sending failed.");

  storeOfflineNoiseAlert(detections);

  return false;

}


// ==========================================================
// 21. RETRY OFFLINE ALERTS
// ==========================================================

void retryPendingAlerts() {

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (pendingNoiseDetections == 0) {
    return;
  }

  Serial.println("Retrying stored alerts...");

  unsigned long saved = pendingNoiseDetections;

  if (sendRepeatedNoiseAlert(saved)) {

    pendingNoiseDetections = 0;

    savePendingAlerts();

    Serial.println("Offline alerts delivered.");

  }

}


// ==========================================================
// 22. TIME SYNCHRONIZATION
// ==========================================================

bool syncServerTime(String serverTime,
                    unsigned long requestStart,
                    unsigned long requestEnd) {

  if (serverTime.length() < 19) {
    return false;
  }

  int year, month, day;

  int hour, minute, second;

  int parsed = sscanf(
    serverTime.c_str(),
    "%d-%d-%dT%d:%d:%d",
    &year,
    &month,
    &day,
    &hour,
    &minute,
    &second
  );

  if (parsed != 6) {
    return false;
  }

  struct tm timeInfo = {};

  timeInfo.tm_year = year - 1900;

  timeInfo.tm_mon = month - 1;

  timeInfo.tm_mday = day;

  timeInfo.tm_hour = hour;

  timeInfo.tm_min = minute;

  timeInfo.tm_sec = second;

  timeInfo.tm_isdst = 0;

  // Flask server time is already IST.

  setenv("TZ", "IST-5:30", 1);

  tzset();

  time_t epoch = mktime(&timeInfo);

  if (epoch <= 0) {
    return false;
  }

  unsigned long roundTrip =
    requestEnd - requestStart;

  epoch += roundTrip / 2000;

  struct timeval tv;

  tv.tv_sec = epoch;

  tv.tv_usec = 0;

  settimeofday(&tv, nullptr);

  Serial.print("Flask IST time synchronized: ");

  Serial.println(serverTime);

  return true;

}


// ==========================================================
// 23. CURRENT DATE AND TIME
// ==========================================================

String getCurrentDateTime() {

  struct tm timeInfo;

  if (!getLocalTime(&timeInfo, 20)) {
    return "Time unavailable";
  }

  char buffer[30];

  strftime(
    buffer,
    sizeof(buffer),
    "%d/%m/%Y %I:%M:%S %p",
    &timeInfo
  );

  return String(buffer);

}


// ==========================================================
// 24. COUNTDOWN FORMAT
// ==========================================================

String formatTime(long seconds) {

  if (seconds < 0) {
    seconds = 0;
  }

  int hours = seconds / 3600;

  int minutes = (seconds % 3600) / 60;

  int secs = seconds % 60;

  char buffer[20];

  sprintf(
    buffer,
    "%02d:%02d:%02d",
    hours,
    minutes,
    secs
  );

  return String(buffer);

}


// ==========================================================
// 25. COUNTDOWN UPDATE
// ==========================================================

void updateCountdown() {

  if (!examActive) {
    return;
  }

  unsigned long elapsed =
    (millis() - countdownAnchorMillis) / 1000;

  long calculated =
    countdownBaseSeconds - elapsed;

  if (calculated < 0) {
    calculated = 0;
  }

  remainingSeconds = calculated;

  if (remainingSeconds <= 0) {

    finishExam();

  }

}


// ==========================================================
// 26. FINAL 30 SECOND COUNTDOWN
// ==========================================================

void serviceFinalCountdown() {

  if (!examActive) {

    finalCountdownActive = false;

    return;
  }

  if (remainingSeconds > 30) {

    finalCountdownActive = false;

    lastFinalCountdownBeep = -1;

    return;
  }

  finalCountdownActive = true;

  int currentSecond = remainingSeconds;

  // Exactly one short beep for each second from 30 to 1.

  if (currentSecond >= 1 &&
      currentSecond <= 30 &&
      currentSecond != lastFinalCountdownBeep) {

    lastFinalCountdownBeep = currentSecond;

    addBeep(1, 90, 30);

    Serial.print("FINAL COUNTDOWN: ");

    Serial.println(currentSecond);

  }

}


// ==========================================================
// 27. NOISE WINDOW RESET
// ==========================================================

void resetNoiseWindow() {

  noiseCount = 0;

  noiseIndex = 0;

  highNoiseAlertSent = false;

  for (int i = 0; i < HIGH_NOISE_LIMIT; i++) {
    noiseTimes[i] = 0;
  }

  Serial.println("Noise detection window reset.");

}


// ==========================================================
// 28. PROCESS SOUND SENSOR
// ==========================================================

void processNoiseDetection() {

  if (!sensorEnabled || !examActive) {

    previousSensorActive = false;

    return;
  }

  unsigned long now = millis();

  if (now - lastSensorPoll < SENSOR_POLL_INTERVAL) {
    return;
  }

  lastSensorPoll = now;

  int sensorValue = digitalRead(SOUND_PIN);

  bool currentlyActive =
    (sensorValue == SOUND_ACTIVE_LEVEL);


  // Sensor is inactive.
  // Re-arm detection.

  if (!currentlyActive) {

    previousSensorActive = false;

    return;
  }


  // Detect a new activation only.

  if (currentlyActive && !previousSensorActive) {

    previousSensorActive = true;

    // Debounce.

    if (now - lastDetectionTime <
        SENSOR_DEBOUNCE_MS) {

      return;
    }

    lastDetectionTime = now;

    lastNoiseDetected = now;


    // Add event to rolling window.

    noiseTimes[noiseIndex] = now;

    noiseIndex =
      (noiseIndex + 1) % HIGH_NOISE_LIMIT;

    if (noiseCount < HIGH_NOISE_LIMIT) {
      noiseCount++;
    }


    Serial.println();

    Serial.println("================================");

    Serial.println("       NOISE DETECTED");

    Serial.println("================================");

    Serial.print("Sensor value: ");

    Serial.println(sensorValue);

    Serial.print("Detection count: ");

    Serial.println(noiseCount);


    // Single noise warning.

    displayMode = DISPLAY_NOISE;

    displayModeStarted = now;

    addBeep(1, 160, 100);


    // Count detections in last 10 seconds.

    int recentCount = 0;

    for (int i = 0; i < HIGH_NOISE_LIMIT; i++) {

      if (noiseTimes[i] > 0 &&
          now - noiseTimes[i] <= NOISE_WINDOW_MS) {

        recentCount++;
      }

    }


    Serial.print("Detections within 10 seconds: ");

    Serial.println(recentCount);


    // HIGH NOISE: 5 detections within 10 seconds.

    if (recentCount >= HIGH_NOISE_LIMIT &&
        !highNoiseAlertSent) {

      highNoiseAlertSent = true;

      displayMode = DISPLAY_HIGH_NOISE;

      displayModeStarted = now;

      Serial.println();

      Serial.println("!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

      Serial.println("       HIGH NOISE ALERT");

      Serial.println("  5 DETECTIONS IN 10 SECONDS");

      Serial.println("!!!!!!!!!!!!!!!!!!!!!!!!!!!!");


      // Two long beeps.

      addBeep(2, 650, 250);


      // Notify Admin.

      sendRepeatedNoiseAlert(recentCount);

    }

  }


  // Reset when there has been no new noise for 10 seconds.

  if (noiseCount > 0 &&
      lastNoiseDetected > 0 &&
      now - lastNoiseDetected >= NOISE_WINDOW_MS) {

    resetNoiseWindow();

  }

}


// ==========================================================
// 29. START EXAM
// ==========================================================

void startExam() {

  if (examActive) {
    return;
  }

  examActive = true;

  examCompleted = false;

  examStopped = false;

  finalCountdownActive = false;

  lastFinalCountdownBeep = -1;

  displayMode = DISPLAY_STARTED;

  displayModeStarted = millis();

  countdownAnchorMillis = millis();

  enableNoiseSensor();

  digitalWrite(GREEN_LED, HIGH);

  digitalWrite(RED_LED, LOW);

  addBeep(2, 650, 250);

  Serial.println();

  Serial.println("==============================");

  Serial.println("         EXAM STARTED");

  Serial.println("==============================");

}


// ==========================================================
// 30. EXAM COMPLETED
// ==========================================================

void finishExam() {

  if (!examActive) {
    return;
  }

  examActive = false;

  examCompleted = true;

  examStopped = false;

  remainingSeconds = 0;

  countdownBaseSeconds = 0;

  disableNoiseSensor();

  finalCountdownActive = false;

  digitalWrite(GREEN_LED, LOW);

  digitalWrite(RED_LED, LOW);

  displayMode = DISPLAY_COMPLETED;

  displayModeStarted = millis();

  addBeep(1, 900, 150);

  Serial.println("EXAM COMPLETED");

}


// ==========================================================
// 31. ADMIN STOPPED EXAM
// ==========================================================

void stopExam() {

  if (!examActive) {
    return;
  }

  examActive = false;

  examStopped = true;

  examCompleted = false;

  disableNoiseSensor();

  finalCountdownActive = false;

  digitalWrite(GREEN_LED, LOW);

  digitalWrite(RED_LED, LOW);

  displayMode = DISPLAY_STOPPED;

  displayModeStarted = millis();

  addBeep(1, 900, 150);

  Serial.println("EXAM STOPPED BY ADMIN");

}


// ==========================================================
// 32. FETCH EXAM SCHEDULE
// ==========================================================

void fetchExamSchedule() {

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi disconnected. Schedule not fetched.");

    return;
  }

  HTTPClient http;

  http.setTimeout(3000);

  unsigned long requestStart = millis();

  http.begin(EXAM_API);

  int response = http.GET();

  unsigned long requestEnd = millis();


  if (response != 200) {

    Serial.print("Exam API HTTP error: ");

    Serial.println(response);

    flaskConnected = false;

    http.end();

    return;
  }


  String body = http.getString();

  http.end();


  JsonDocument doc;

  DeserializationError error =
    deserializeJson(doc, body);

  if (error) {

    Serial.print("JSON error: ");

    Serial.println(error.c_str());

    flaskConnected = false;

    return;
  }


  flaskConnected = true;

  lastSuccessfulApi = millis();


  Serial.println("Flask API connected.");


  String serverTime =
    doc["server_time"] | "";

  if (serverTime.length() >= 19) {

    syncServerTime(
      serverTime,
      requestStart,
      requestEnd
    );

  }


  bool success = doc["success"] | false;

  bool found = doc["found"] | false;


  if (!success || !found) {

    Serial.println("No examination currently found.");

    // Do not stop an active exam because of a
    // temporary missing schedule response.

    return;
  }


  int receivedExamId =
    doc["exam_id"] | -1;

  String receivedStatus =
    doc["exam_status"] | "UNKNOWN";

  receivedStatus.toUpperCase();


  Serial.print("Exam ID: ");

  Serial.println(receivedExamId);

  Serial.print("Exam status: ");

  Serial.println(receivedStatus);


  // Reset latches only for a genuinely new exam.

  if (receivedExamId != currentExamId) {

    currentExamId = receivedExamId;

    examCompleted = false;

    examStopped = false;

    examActive = false;

    finalCountdownActive = false;

    resetNoiseWindow();

    Serial.println("New examination detected.");

  }


  hallCode = doc["hall_code"] | hallCode;

  hallName = doc["hall_name"] | hallName;

  examTitle = doc["exam_title"] | examTitle;

  examSubject = doc["subject"] | examSubject;

  examStartTime = doc["start_at"] | examStartTime;

  examEndTime = doc["end_at"] | examEndTime;

  examStatus = receivedStatus;


  long receivedRemaining =
    doc["remaining_seconds"] | 0;


  // Admin stopped or cancelled.

  if (receivedStatus == "STOPPED" ||
      receivedStatus == "CANCELLED") {

    if (examActive) {
      stopExam();
    }

    return;
  }


  // Backend reports completion.

  if (receivedStatus == "COMPLETED" ||
      receivedStatus == "FINISHED" ||
      receivedStatus == "ENDED") {

    if (examActive) {
      finishExam();
    }

    return;
  }


  // Ongoing examination.

  if (receivedStatus == "ONGOING" ||
      receivedStatus == "STARTED") {

    // Do not restart an exam already completed/stopped
    // locally for the same exam ID.

    if (examCompleted || examStopped) {
      return;
    }

    if (!examActive) {

      countdownBaseSeconds = receivedRemaining;

      remainingSeconds = receivedRemaining;

      countdownAnchorMillis = millis();

      startExam();

    } else {

      // Synchronize the countdown with Flask.

      countdownBaseSeconds = receivedRemaining;

      remainingSeconds = receivedRemaining;

      countdownAnchorMillis = millis();

    }

  }


  // Scheduled examination.

  else if (receivedStatus == "SCHEDULED") {

    if (!examActive) {

      countdownBaseSeconds = receivedRemaining;

      remainingSeconds = receivedRemaining;

      displayMode = DISPLAY_WAITING;

    }

  }

}


// ==========================================================
// 33. WIFI CONNECTION
// ==========================================================

void connectWiFi() {

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long now = millis();

  if (now - lastWifiAttempt < WIFI_RETRY_INTERVAL) {
    return;
  }

  lastWifiAttempt = now;

  Serial.println("Attempting WiFi connection...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

}


void checkWiFi() {

  wifiConnected =
    (WiFi.status() == WL_CONNECTED);

  if (wifiConnected) {

    static bool reported = false;

    if (!reported) {

      Serial.println("WiFi connected.");

      Serial.print("ESP32 IP: ");

      Serial.println(WiFi.localIP());

      reported = true;

    }

  } else {

    connectWiFi();

  }

}


// ==========================================================
// 34. STARTUP ANIMATION
// ==========================================================

void startupAnimation() {

  for (int i = 0; i < 3; i++) {

    oled.clearBuffer();

    oled.setFont(u8g2_font_6x13B_tf);

    oled.drawStr(25, 22, "EXAMGUARD");

    oled.drawFrame(10, 35, 108, 10);

    oled.drawBox(12, 37, 104, 6);

    oled.sendBuffer();

    delay(300);

    oled.clearBuffer();

    oled.sendBuffer();

    delay(150);

  }

}


// ==========================================================
// 35. WIFI SCREEN
// ==========================================================

void showWifiScreen() {

  oled.clearBuffer();

  oled.setFont(u8g2_font_6x13B_tf);

  oled.drawStr(20, 18, "EXAMGUARD");

  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(12, 35, "Connecting to WiFi");

  oled.drawStr(12, 51, "Please wait...");

  oled.sendBuffer();

}


// ==========================================================
// 36. WAITING SCREEN
// ==========================================================

void showWaitingScreen() {

  oled.clearBuffer();

  oled.setFont(u8g2_font_6x13B_tf);

  oled.drawStr(20, 15, "EXAMGUARD");

  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(5, 32, "Waiting for exam");

  oled.drawStr(5, 47, hallCode.c_str());

  oled.drawStr(5, 62, wifiConnected ?
    "WiFi Connected" :
    "WiFi Disconnected");

  oled.sendBuffer();

}


// ==========================================================
// 37. STARTED SCREEN
// ==========================================================

void showStartedScreen() {

  oled.clearBuffer();

  oled.setFont(u8g2_font_6x13B_tf);

  oled.drawStr(22, 25, "EXAM STARTED");

  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(22, 45, "Keep silence");

  oled.sendBuffer();

}


// ==========================================================
// 38. EXAM DETAILS SCREEN
// ==========================================================

void showExamDetails() {

  oled.clearBuffer();

  oled.setFont(u8g2_font_5x8_tf);

  oled.drawStr(0, 9, hallCode.c_str());

  oled.drawStr(0, 19, hallName.c_str());

  oled.drawStr(0, 30, examTitle.c_str());

  oled.drawStr(0, 40, examSubject.c_str());

  oled.drawStr(0, 51, getCurrentDateTime().c_str());

  oled.drawStr(0, 63, wifiConnected ?
    "WiFi: ON" :
    "WiFi: OFF - LOCAL MODE");

  oled.sendBuffer();

}


// ==========================================================
// 39. COUNTDOWN SCREEN
// ==========================================================

void showCountdown() {

  oled.clearBuffer();

  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(0, 12, "EXAM TIME REMAINING");

  oled.setFont(u8g2_font_6x13B_tf);

  String remaining = formatTime(remainingSeconds);

  int width = oled.getStrWidth(remaining.c_str());

  oled.drawStr(
    (128 - width) / 2,
    37,
    remaining.c_str()
  );

  oled.setFont(u8g2_font_5x8_tf);

  oled.drawStr(0, 52, getCurrentDateTime().c_str());

  oled.drawStr(0, 63, wifiConnected ?
    "WiFi Connected" :
    "WiFi Disconnected");

  oled.sendBuffer();

}


// ==========================================================
// 40. ROBOT EYES
// ==========================================================

void showRobotEyes() {

  static int eyePosition = 0;

  oled.clearBuffer();

  oled.drawRBox(
    20 + eyePosition,
    18,
    32,
    30,
    7
  );

  oled.drawRBox(
    76 - eyePosition,
    18,
    32,
    30,
    7
  );

  oled.setDrawColor(0);

  oled.drawDisc(
    36 + eyePosition,
    33,
    5
  );

  oled.drawDisc(
    92 - eyePosition,
    33,
    5
  );

  oled.setDrawColor(1);

  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(34, 61, "EXAMGUARD");

  oled.sendBuffer();

  eyePosition += 2;

  if (eyePosition > 8) {
    eyePosition = 0;
  }

}


// ==========================================================
// 41. SINGLE NOISE WARNING
// ==========================================================

void showNoiseScreen() {

  oled.clearBuffer();

  oled.setFont(u8g2_font_6x13B_tf);

  oled.drawStr(15, 19, "NOISE DETECTED!");

  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(8, 37, "PLEASE KEEP SILENCE");

  oled.drawStr(30, 58, "EXAMGUARD");

  oled.sendBuffer();

}


// ==========================================================
// 42. HIGH NOISE WARNING
// ==========================================================

void showHighNoiseScreen() {

  oled.clearBuffer();

  oled.setFont(u8g2_font_6x13B_tf);

  oled.drawStr(17, 17, "HIGH NOISE!");

  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(5, 34, "5 detections in 10 sec");

  oled.drawStr(10, 48, "Admin has been alerted");

  oled.drawStr(30, 62, "EXAMGUARD");

  oled.sendBuffer();

}


// ==========================================================
// 43. COMPLETED SCREEN
// ==========================================================

void showCompletedScreen() {

  oled.clearBuffer();

  oled.setFont(u8g2_font_6x13B_tf);

  oled.drawStr(16, 24, "EXAM COMPLETED");

  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(28, 45, "Well done!");

  oled.sendBuffer();

}


// ==========================================================
// 44. STOPPED SCREEN
// ==========================================================

void showStoppedScreen() {

  oled.clearBuffer();

  oled.setFont(u8g2_font_6x13B_tf);

  oled.drawStr(24, 25, "EXAM STOPPED");

  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(20, 45, "By Administrator");

  oled.sendBuffer();

}


// ==========================================================
// 45. DISPLAY SERVICE
// ==========================================================

void serviceDisplay() {

  unsigned long now = millis();

  if (now - lastDisplayUpdate < DISPLAY_INTERVAL) {
    return;
  }

  lastDisplayUpdate = now;


  // Final countdown has display priority.

  if (examActive && remainingSeconds <= 30) {

    showCountdown();

    return;

  }


  // High-noise warning.

  if (displayMode == DISPLAY_HIGH_NOISE) {

    if (now - displayModeStarted < 3000) {

      showHighNoiseScreen();

      return;

    }

    displayMode = DISPLAY_COUNTDOWN;

  }


  // Single noise warning.

  if (displayMode == DISPLAY_NOISE) {

    if (now - displayModeStarted < 3000) {

      showNoiseScreen();

      return;

    }

    displayMode = DISPLAY_COUNTDOWN;

  }


  // Exam started.

  if (displayMode == DISPLAY_STARTED) {

    if (now - displayModeStarted < 3000) {

      showStartedScreen();

      return;

    }

    displayMode = DISPLAY_DETAILS;

    lastSlideChange = now;

  }


  // Completed.

  if (displayMode == DISPLAY_COMPLETED) {

    showCompletedScreen();

    if (now - displayModeStarted >= 3000) {

      displayMode = DISPLAY_WIFI;

    }

    return;

  }


  // Stopped.

  if (displayMode == DISPLAY_STOPPED) {

    showStoppedScreen();

    if (now - displayModeStarted >= 3000) {

      displayMode = DISPLAY_WIFI;

    }

    return;

  }


  // No active exam.

  if (!examActive) {

    if (!wifiConnected) {

      showWifiScreen();

    } else {

      showWaitingScreen();

    }

    return;

  }


  // Normal examination slides.

  if (now - lastSlideChange >= 3000) {

    lastSlideChange = now;

    slideNumber++;

    if (slideNumber > 3) {
      slideNumber = 1;
    }

  }


  if (slideNumber == 1) {

    showExamDetails();

  } else if (slideNumber == 2) {

    showCountdown();

  } else {

    showRobotEyes();

  }

}


// ==========================================================
// 46. FLASK CONNECTION CHECK
// ==========================================================

void checkFlaskConnection() {

  if (WiFi.status() != WL_CONNECTED) {

    flaskConnected = false;

    return;
  }

  if (millis() - lastSuccessfulApi > 45000) {

    flaskConnected = false;

  }

}


// ==========================================================
// 47. SERIAL SENSOR DEBUGGING
// ==========================================================

void debugSoundSensor() {

  static unsigned long lastDebug = 0;

  if (millis() - lastDebug >= 1000) {

    lastDebug = millis();

    Serial.print("SOUND PIN: ");

    Serial.print(digitalRead(SOUND_PIN));

    Serial.print(" | SENSOR: ");

    Serial.print(sensorEnabled ? "ON" : "OFF");

    Serial.print(" | EXAM: ");

    Serial.print(examActive ? "ACTIVE" : "INACTIVE");

    Serial.print(" | NOISE COUNT: ");

    Serial.println(noiseCount);

  }

}
// ==========================================================
// LED CONTROL
// ==========================================================

void updateLEDs() {

  unsigned long now = millis();

  // Exam is not active
  if (!examActive) {

    digitalWrite(GREEN_LED, LOW);
    digitalWrite(RED_LED, LOW);

    return;
  }

  // Green LED stays ON during examination
  digitalWrite(GREEN_LED, HIGH);

  // Final 30-second countdown:
  // Red LED blinks every 150 milliseconds
  if (finalCountdownActive) {

    if (now - finalLedTimer >= 150) {

      finalLedTimer = now;

      finalLedState = !finalLedState;

      digitalWrite(
        RED_LED,
        finalLedState ? HIGH : LOW
      );

    }

    return;
  }

  // High-noise warning:
  // Red LED blinks
  if (displayMode == DISPLAY_HIGH_NOISE) {

    if (now - highLedTimer >= 200) {

      highLedTimer = now;

      highLedState = !highLedState;

      digitalWrite(
        RED_LED,
        highLedState ? HIGH : LOW
      );

    }

    return;
  }

  // Single noise warning:
  // Red LED stays ON
  if (displayMode == DISPLAY_NOISE) {

    digitalWrite(RED_LED, HIGH);

    return;
  }

  // Normal examination
  digitalWrite(RED_LED, LOW);

}

// ==========================================================
// 48. SETUP
// ==========================================================

void setup() {

  Serial.begin(115200);

  delay(500);

  Serial.println();

  Serial.println("================================");

  Serial.println("          EXAMGUARD");

  Serial.println("       ESP32 INITIALIZING");

  Serial.println("================================");


  // Hardware.

  pinMode(SOUND_PIN, INPUT_PULLUP);

  pinMode(GREEN_LED, OUTPUT);

  pinMode(RED_LED, OUTPUT);

  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(GREEN_LED, LOW);

  digitalWrite(RED_LED, LOW);

  digitalWrite(BUZZER_PIN, LOW);


  // OLED.

  Wire.begin(OLED_SDA, OLED_SCK);

  oled.begin();

  oled.setContrast(255);

  startupAnimation();


  // Offline storage.

  loadPendingAlerts();


  // WiFi.

  WiFi.mode(WIFI_STA);

  WiFi.setAutoReconnect(true);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);


  // Initial state.

  sensorEnabled = false;

  examActive = false;

  displayMode = DISPLAY_WIFI;

  lastSlideChange = millis();


  Serial.println("Hardware initialization complete.");

  Serial.println("Waiting for WiFi...");

}


// ==========================================================
// 49. MAIN LOOP
// ==========================================================

void loop() {

  unsigned long now = millis();


  // 1. WiFi.

  checkWiFi();


  // 2. Sensor polling FIRST.

  processNoiseDetection();


  // 3. Countdown.

  if (examActive) {

    updateCountdown();

  }


  // 4. Final countdown.

  serviceFinalCountdown();


  // 5. LED control.

  updateLEDs();


  // 6. Buzzer.

  serviceBuzzer();


  // 7. Display.

  serviceDisplay();


  // 8. Fetch exam schedule.

  if (wifiConnected &&
      now - lastScheduleFetch >= API_INTERVAL) {

    lastScheduleFetch = now;

    fetchExamSchedule();

  }


  // 9. Flask connection.

  checkFlaskConnection();


  // 10. Retry stored alerts.

  if (wifiConnected &&
      now - lastAlertRetry >= ALERT_RETRY_INTERVAL) {

    lastAlertRetry = now;

    retryPendingAlerts();

  }


  // 11. Debugging.

  debugSoundSensor();


  delay(1);

}