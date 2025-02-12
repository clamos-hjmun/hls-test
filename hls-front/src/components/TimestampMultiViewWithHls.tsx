import React, { useEffect, useRef, useState, useCallback } from "react";
import Skeleton from "@mui/material/Skeleton";
import useStore from "store/useStore";
import serverConfig from "config";
import videojs from "video.js";
import Hls from "hls.js";
import "video.js/dist/video-js.css";

const TimestampMultiViewWithHls: React.FC = () => {
  const { setIsLoading } = useStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mergedVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [timelineImages, setTimelineImages] = useState<{ url: string; time: number }[]>([]);
  const [duration, setDuration] = useState<number>(0);
  const [dragging, setDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [ranges, setRanges] = useState<{ id: string; start: number; end: number }[]>([]);
  const [draggingHandle, setDraggingHandle] = useState<"start" | "end" | null>(null);
  const [selectedRangeId, setSelectedRangeId] = useState<string | null>(null);
  const [m3u8FileObject, setM3u8FileObject] = useState<{ accumulatedTime: number; duration: string; tsFile: string }[]>(
    []
  );

  const SERVER_URL = serverConfig.url;

  // 비디오 초기화 및 메타데이터 로드 시 타임라인 생성
  useEffect(() => {
    if (videoRef.current) {
      const player = videojs(videoRef.current, {
        autoplay: false,
        controls: true,
        muted: true,
        preload: "auto",
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5],
        sources: [
          {
            src: `${SERVER_URL}/api/hls`,
            type: "application/x-mpegURL",
          },
        ],
      });

      player.on("loadedmetadata", () => {
        const duration = player.duration();
        setDuration(duration);
        generateTimeline(duration);
      });

      return () => {
        player.dispose();
      };
    }
  }, []);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/hls`)
      .then((res) => res.text())
      .then((m3u8Text) => {
        const tsArray = [];
        let accumulatedTime = 0;
        const regex = /#EXTINF:(\d+\.\d+),\s*(\S+\.ts)/g;
        let match;

        // 정규식을 사용해 #EXTINF와 ts 파일을 찾아서 배열로 저장
        while ((match = regex.exec(m3u8Text)) !== null) {
          accumulatedTime += parseFloat(match[1]);
          tsArray.push({
            accumulatedTime: accumulatedTime,
            duration: match[1],
            tsFile: match[2],
          });
        }

        // 결과 배열 저장
        setM3u8FileObject(tsArray);
      });
  }, []);

  const modifyM3U8 = () => {
    // 필터링된 .ts 파일들로 새로운 m3u8 생성
    let newM3U8Content = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:12\n#EXT-X-MEDIA-SEQUENCE:0\n";
    let previousEndTime = 0;
    // ranges에 포함된 시간 범위에 해당하는 ts 파일들만 필터링
    const filteredTsFiles = m3u8FileObject.filter(({ accumulatedTime }) => {
      // 선택된 범위 중 하나라도 해당 ts 파일의 accumulatedTime이 범위 안에 포함되는지 체크
      return ranges.some((range) => accumulatedTime >= range.start && accumulatedTime <= range.end);
    });

    // 필터링된 .ts 파일들을 새로운 m3u8 포맷으로 변환
    filteredTsFiles.forEach((file, index) => {
      // 새로운 영역이 시작될 때마다 EXT-X-DISCONTINUITY 추가
      if (index > 0 && file.accumulatedTime !== previousEndTime) {
        newM3U8Content += "#EXT-X-DISCONTINUITY\n";
      }

      newM3U8Content += `#EXTINF:${file.duration},\n${file.tsFile}\n`;
      previousEndTime = file.accumulatedTime + file.duration;
    });

    newM3U8Content += "#EXT-X-ENDLIST";

    fetch(`${SERVER_URL}/api/hls/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ m3u8Content: newM3U8Content }),
    })
      .then((response) => response.json())
      .then((data) => {
        const streamUrl = data.streamUrl;

        videojs(mergedVideoRef.current, {
          autoplay: true,
          controls: true,
          muted: true,
          preload: "auto",
          playbackRates: [0.5, 0.75, 1, 1.25, 1.5],
          sources: [
            {
              src: `${SERVER_URL}/api/updated_playlist.m3u8`,
              type: "application/x-mpegURL",
            },
          ],
        });
      })
      .catch((error) => console.error("Error updating m3u8:", error));
  };

  // 타임라인 이미지 생성 함수
  const generateTimeline = async (duration: number) => {
    if (!videoRef.current) return;

    const numImages = 10;
    const interval = duration / numImages;

    const video = videoRef.current;
    video.pause();

    try {
      const imagePromises = Array.from({ length: numImages }, async (_, index) => {
        const time = index * interval;
        return await createThumbnail(time);
      });

      const images = await Promise.all(imagePromises);

      setTimelineImages(images);
    } catch (error) {
      console.error("Failed to generate timeline:", error);
    } finally {
      video.currentTime = 0;
      video.play();
    }
  };

  // 특정 시간의 썸네일 생성 함수
  const createThumbnail = useCallback((time: number): Promise<{ url: string; time: number }> => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      const hls = new Hls();
      hls.loadSource(`${SERVER_URL}/api/hls`);
      hls.attachMedia(video);

      video.muted = true;
      canvas.width = 640;
      canvas.height = 360;

      video.addEventListener("loadedmetadata", () => {
        video.currentTime = time;
      });

      video.addEventListener("seeked", () => {
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve({ url: canvas.toDataURL(), time });
        } else {
          resolve({ url: "", time });
        }
      });

      video.load();
    });
  }, []);

  // 썸네일 클릭 시 비디오 재생 위치 이동
  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    const canvas = e.target as HTMLCanvasElement;

    if (!canvas || !canvas.getBoundingClientRect) return;

    const canvasRect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const time = (mouseX / canvasRect.width) * duration;

    if (videoRef.current) {
      const player = videojs(videoRef.current);
      player.currentTime(time);
    }
  };

  useEffect(() => {
    document.addEventListener("mouseup", handleCanvasMouseUp);

    return () => {
      document.removeEventListener("mouseup", handleCanvasMouseUp);
    };
  }, [selectionRange]);

  useEffect(() => {
    if (selectedRangeId && videoRef.current) {
      const player = videojs(videoRef.current);
      const selectionRange = ranges.find((range) => range.id === selectedRangeId);

      if (!selectionRange) return;

      const onTimeUpdate = () => {
        if (player.currentTime() >= selectionRange.end) {
          player.pause();
          player.off("timeupdate", onTimeUpdate);
        }
      };
      player.on("timeupdate", onTimeUpdate);

      if (selectionRange.start !== undefined) {
        player.currentTime(selectionRange.start);
        player.play();
      }

      return () => {
        player.off("timeupdate", onTimeUpdate);
      };
    }
  }, [selectedRangeId]);

  // 선택 범위 드래그 시작
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    const canvas = e.target as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const startX = e.clientX - canvasRect.left;
    setDragStartX(startX);
    setSelectionRange(null);

    e.preventDefault();
  };

  // 선택 범위 드래그 진행
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragging || draggingHandle) return;

    const canvas = e.target as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;

    const start = Math.min(dragStartX, mouseX);
    const end = Math.max(dragStartX, mouseX);

    const startTime = (start / canvasRect.width) * duration;
    const endTime = (end / canvasRect.width) * duration;

    setSelectionRange({ start: startTime, end: endTime });
  };

  // 선택 범위 드래그 종료
  const handleCanvasMouseUp = () => {
    setDragging(false);

    if (selectionRange) {
      setRanges((prevRanges) => [
        ...prevRanges,
        {
          id: `range-${Date.now()}`,
          start: selectionRange.start,
          end: selectionRange.end,
        },
      ]);

      setSelectionRange(null);
    }
  };

  // 선택 범위 삭제
  const handleRangeRemove = () => {
    if (!selectedRangeId) {
      alert("삭제할 범위를 선택해주세요.");
      return;
    }

    setRanges((prevRanges) => prevRanges.filter((range) => range.id !== selectedRangeId));
    setSelectedRangeId(null);
  };

  // 선택 범위 병합 처리 함수
  const handleMerge = async () => {
    if (!ranges || ranges.length === 0) {
      alert("병합할 범위를 선택해 주세요.");
      return;
    }

    modifyM3U8();
  };

  // 비디오의 currentTime을 기준으로 빨간 세로선을 그리는 함수
  const drawCurrentTimeLine = () => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const video = videoRef.current;

    if (!context) return;

    const currentTime = video.currentTime;
    const canvasWidth = canvas.width;
    const lineX = (currentTime / duration) * canvasWidth;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.moveTo(lineX, 0);
    context.lineTo(lineX, canvas.height);
    context.strokeStyle = "red";
    context.lineWidth = 0.5;
    context.stroke();
  };

  // 비디오의 currentTime에 맞춰 세로선 갱신
  useEffect(() => {
    const updateTimeLine = () => {
      drawCurrentTimeLine();
      requestAnimationFrame(updateTimeLine);
    };

    requestAnimationFrame(updateTimeLine);
  }, [duration]);

  // 선택 범위 핸들 드래그 시작
  const handleMouseDownHandle = (rangeId: string, handleType: "start" | "end", event: React.MouseEvent) => {
    event.preventDefault();
    setDragging(true);
    setDraggingHandle(handleType);
    setSelectedRangeId(rangeId);
  };

  // 선택 범위 핸들 드래그 진행
  const handleMouseMove = (e: MouseEvent) => {
    if (!draggingHandle || !selectedRangeId || !canvasRef.current) return;

    e.preventDefault();

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const time = (mouseX / canvasRect.width) * duration;

    // 선택된 범위 찾아서 드래그 시작/끝 위치를 수정
    setRanges((prevRanges) =>
      prevRanges.map((range) => {
        if (range.id === selectedRangeId) {
          if (draggingHandle === "start" && time < range.end) {
            return { ...range, start: Math.max(time, 0) };
          } else if (draggingHandle === "end" && time > range.start) {
            return { ...range, end: Math.min(time, duration) };
          }
        }
        return range;
      })
    );
  };

  // 선택 범위 핸들 드래그 종료
  const handleMouseUp = () => {
    setDragging(false);
    setDraggingHandle(null);
  };

  useEffect(() => {
    if (draggingHandle) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingHandle]);

  // 시간 포맷팅 함수
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="video-wrapper">
      <div className="video-player">
        <div
          style={{
            display: "relative",
            width: 800,
            height: 340,
          }}
        >
          {timelineImages.length === 0 && (
            <Skeleton
              variant="rectangular"
              width={"100%"}
              height={"100%"}
              animation="wave"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 800,
                height: 340,
              }}
            />
          )}
          <video
            ref={videoRef}
            className="video-js vjs-default-skin"
            controls
            preload="auto"
            width="800"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              visibility: timelineImages.length !== 0 ? "visible" : "hidden",
            }}
          />
        </div>

        {timelineImages.length !== 0 ? (
          <>
            <div className="timeline-container">
              {timelineImages.map((thumbnail, index) => {
                return (
                  <div key={index} className="timeline-thumbnail">
                    <img src={thumbnail.url} alt={`Screenshot at ${thumbnail.time}s`} />
                    <div className="timestamp">{formatTime(thumbnail.time)}</div>
                  </div>
                );
              })}
              <canvas
                ref={canvasRef}
                className="timeline-canvas"
                width={160}
                height={90}
                onDoubleClick={handleCanvasDoubleClick}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
              />
              {ranges.map((range) => (
                <div
                  key={range.id}
                  className="selection-range"
                  style={{
                    border: selectedRangeId === range.id ? "2px solid #0056b3" : "2px solid rgb(204, 204, 204)",
                    left: `${(range.start / duration) * 100}%`,
                    width: `${((range.end - range.start) / duration) * 100}%`,
                  }}
                  onClick={() => setSelectedRangeId(range.id)}
                >
                  <div
                    className="handle start-handle"
                    style={{ left: 0 }}
                    onMouseDown={(e) => handleMouseDownHandle(range.id, "start", e)}
                  />
                  <div
                    className="handle end-handle"
                    style={{ right: 0 }}
                    onMouseDown={(e) => handleMouseDownHandle(range.id, "end", e)}
                  />
                </div>
              ))}
              {selectionRange && (
                <div
                  className="selection-range"
                  style={{
                    left: `${(selectionRange.start / duration) * 100}%`,
                    width: `${((selectionRange.end - selectionRange.start) / duration) * 100}%`,
                  }}
                ></div>
              )}
            </div>
          </>
        ) : (
          <React.Fragment>
            <div className="timeline-container">
              <Skeleton variant="rectangular" width={"100%"} height={90} animation="wave" />
            </div>
          </React.Fragment>
        )}
        <div className="controls">
          <button onClick={handleRangeRemove}>Clear Selection</button>
          <button onClick={handleMerge}>Merge</button>
        </div>
      </div>
      <video
        ref={mergedVideoRef}
        className="merged-video-container video-js vjs-default-skin"
        controls
        preload="auto"
      />
    </div>
  );
};

export default TimestampMultiViewWithHls;
