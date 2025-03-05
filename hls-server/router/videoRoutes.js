const express = require("express");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

const router = express.Router();

// HLS 스트리밍과 관련된 디렉토리 설정
const HLS_DIRECTORY = path.join(__dirname, "../hls");
// const HLS_DIRECTORY = "/root/hls";
const OUTPUT_DIRECTORY = path.join(__dirname, "../output");

// 클라이언트가 요청한 세그먼트 목록 제공
router.get("/video-stream", async (_, res) => {
  try {
    const segments = await getVideoSegments(HLS_DIRECTORY);
    res.json(segments);
  } catch (error) {
    res.status(500).send("Failed to fetch video segments");
  }
});

router.post("/hls/update", (req, res) => {
  const { m3u8Content } = req.body;

  // 새로운 m3u8 콘텐츠를 파일로 저장
  const m3u8Path = path.join(HLS_DIRECTORY, "updated_playlist.m3u8");

  fs.writeFileSync(m3u8Path, m3u8Content);

  // 클라이언트에게 스트리밍 URL을 반환
  res.json({ streamUrl: `http://localhost:4000/api/updated_playlist.m3u8` });
});

router.get("/updated_playlist.m3u8", (_, res) => {
  const playlistPath = path.join(HLS_DIRECTORY, "updated_playlist.m3u8");
  sendFileIfExists(playlistPath, res, "Playlist not found");
});

// HLS 플레이리스트 제공
router.get("/hls", (_, res) => {
  const playlistPath = path.join(HLS_DIRECTORY, "output.m3u8");
  console.log("playlistPath:", playlistPath);
  sendFileIfExists(playlistPath, res, "Playlist not found");
});

// HLS 세그먼트 파일 제공
router.get("/:filename", (req, res) => {
  const filePath = path.join(HLS_DIRECTORY, req.params.filename);
  sendFileIfExists(filePath, res, "Segment not found");
});

// 비디오 추출 요청 처리
router.post("/extract-video", async (req, res) => {
  const { startTime, duration } = req.body;
  const hlsUrl = `http://localhost:4000/api/hls`;
  const outputPath = path.join(OUTPUT_DIRECTORY, "extracted_video.mp4");

  try {
    await extractVideo(hlsUrl, startTime, duration, outputPath);
    res.json({ downloadUrl: `/output/extracted_video.mp4` });
  } catch (error) {
    res.status(500).send("Error extracting video");
  }
});

// 파일 다운로드 처리
router.get("/output/extracted_video.mp4", (req, res) => {
  const filePath = path.join(OUTPUT_DIRECTORY, "extracted_video.mp4");
  res.setHeader("Content-Disposition", 'attachment; filename="extracted_video.mp4"');
  res.sendFile(filePath);
});

// 비디오 병합 API 엔드포인트
router.post("/merge-video", async (req, res) => {
  const { ranges } = req.body; // 클라이언트로부터 받은 범위 목록
  const hlsUrl = `http://localhost:4000/api/hls`; // HLS URL
  const outputPath = path.join(OUTPUT_DIRECTORY, "merged_video.mp4"); // 병합된 비디오 저장 경로

  try {
    const updatedRanges = ranges.map(({ start, end }) => ({
      start,
      duration: end - start, // 범위의 지속 시간을 계산
    }));

    await mergeVideo(hlsUrl, updatedRanges, outputPath); // 비디오 병합 함수 호출
    res.setHeader("Content-Disposition", 'attachment; filename="merged_video.mp4"');
    res.sendFile(outputPath);
  } catch (error) {
    console.error("비디오 병합 중 오류 발생:", error);
    res.status(500).send("Error merging video");
  }
});

// 비디오 다운로드 처리
router.get("/output/merged_video.mp4", (req, res) => {
  const filePath = path.join(OUTPUT_DIRECTORY, "merged_video.mp4");
  res.setHeader("Content-Disposition", 'attachment; filename="merged_video.mp4"');
  res.sendFile(filePath);
});

// 비디오 병합 함수
const mergeVideo = (hlsUrl, ranges, outputPath) => {
  return new Promise((resolve, reject) => {
    const ffmpegCommand = ffmpeg();

    // 비디오 파일마다 입력을 추가하고 시작 시간 및 지속 시간을 설정
    ranges.forEach((range) => {
      // 시작 시간 (-ss)과 지속 시간 (-t)을 설정
      if (range.start && range.duration) {
        // 비디오 입력을 추가하고, 해당 구간에 대한 옵션을 설정
        ffmpegCommand.input(hlsUrl).inputOptions([`-ss ${range.start}`, `-t ${range.duration}`]);
      } else {
        // 잘못된 값이 있으면 오류 처리
        return reject(new Error("Invalid startTime or duration"));
      }
    });

    // 입력이 추가되면 병합을 위한 작업을 실행
    ffmpegCommand
      .on("end", () => {
        console.log("Video merge completed");
        resolve();
      })
      .on("error", (err) => {
        console.error("Error during video merge:", err);
        reject(err);
      })
      .mergeToFile(outputPath, "/path/to/tmp/folder"); // 임시 폴더 경로 추가
  });
};

// HLS 세그먼트 목록을 가져오는 함수
const getVideoSegments = async (directory) => {
  const files = await fs.promises.readdir(directory);
  return files
    .filter((file) => file.endsWith(".ts"))
    .sort((a, b) => {
      const aStat = fs.statSync(path.join(directory, a));
      const bStat = fs.statSync(path.join(directory, b));
      return aStat.mtimeMs - bStat.mtimeMs;
    });
};

// 파일이 존재하면 해당 파일을 전송하는 함수
const sendFileIfExists = (filePath, res, errorMessage) => {
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send(errorMessage);
  }
};

// ffmpeg를 사용하여 HLS 스트림에서 비디오를 추출하는 함수
const extractVideo = (hlsUrl, startTime, duration, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(hlsUrl)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputPath)
      .on("end", () => {
        console.log("Video extraction completed");
        resolve();
      })
      .on("error", (err) => {
        console.error("Error extracting video:", err);
        reject(err);
      })
      .run();
  });
};

module.exports = router;
