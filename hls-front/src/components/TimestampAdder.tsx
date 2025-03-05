import React, { useEffect, useRef, useState } from "react";
import Skeleton from "@mui/material/Skeleton";
import useStore from "store/useStore";
import serverConfig from "config";
import videojs from "video.js";
import "video.js/dist/video-js.css";

type Canvas = {
  id: number;
};

const TimestampAdder: React.FC = () => {
  const { setIsLoading } = useStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mergedVideoRef = useRef<HTMLVideoElement | null>(null);
  const selectionRangeRef = useRef<{ id: number; start: number; end: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [timelineImages, setTimelineImages] = useState<number[]>([]);
  const [duration, setDuration] = useState<number>(0);
  const [dragging, setDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [selectionRange, setSelectionRange] = useState<{ id: number; start: number; end: number } | null>(null);
  const [ranges, setRanges] = useState<{ id: number; start: number; end: number }[]>([]);
  const [draggingHandle, setDraggingHandle] = useState<"start" | "end" | null>(null);
  const [selectedRangeId, setSelectedRangeId] = useState<number | null>(null);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
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
        setCanvases([{ id: Date.now() }]);
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

  const modifyM3U8 = (mergedRanges: { id: number; start: number; end: number }[]) => {
    // 필터링된 .ts 파일들로 새로운 m3u8 생성
    let newM3U8Content = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:12\n#EXT-X-MEDIA-SEQUENCE:0\n";
    let previousEndTime = 0;
    // ranges에 포함된 시간 범위에 해당하는 ts 파일들만 필터링
    const filteredTsFiles = m3u8FileObject.filter(({ accumulatedTime }) => {
      // 선택된 범위 중 하나라도 해당 ts 파일의 accumulatedTime이 범위 안에 포함되는지 체크
      return mergedRanges.some((range) => accumulatedTime >= range.start && accumulatedTime <= range.end);
    });

    // 필터링된 .ts 파일들을 새로운 m3u8 포맷으로 변환
    filteredTsFiles.forEach((file, index) => {
      // 새로운 영역이 시작될 때마다 EXT-X-DISCONTINUITY 추가
      if (index > 0 && file.accumulatedTime !== previousEndTime) {
        newM3U8Content += "#EXT-X-DISCONTINUITY\n";
      }

      newM3U8Content += `#EXTINF:${file.duration},\n${file.tsFile}\n`;
      previousEndTime = file.accumulatedTime + Number(file.duration);
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
      .then(() => {
        if (!mergedVideoRef.current) return;

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
      const times = Array.from({ length: numImages }, (_, index) => index * interval);
      setTimelineImages(times);
    } catch (error) {
      console.error("Failed to generate timeline:", error);
    } finally {
      video.currentTime = 0;
      video.play();
    }
  };

  // 썸네일 클릭 시 비디오 재생 위치 이동
  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    const canvas = e.target as HTMLCanvasElement;
    if (!canvas || !canvas.getBoundingClientRect) return;

    // 기존에 선택된 범위가 있으면 삭제
    const canvasRect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;
    const time = (mouseX / canvasRect.width) * duration;

    if (videoRef.current) {
      const player = videojs(videoRef.current);
      player.currentTime(time);
    }
  };

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
        console.log(formatTime(selectionRange.start));
        player.currentTime(selectionRange.start);
        player.play();
      }

      return () => {
        player.off("timeupdate", onTimeUpdate);
      };
    }
  }, [selectedRangeId]);

  // 선택 범위 드래그 시작
  const handleCanvasMouseDown = (e: React.MouseEvent, canvasId: number) => {
    setDragging(true);
    setSelectionRange(null);
    selectionRangeRef.current = null;

    const canvas = e.target as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const startX = e.clientX - canvasRect.left;
    setDragStartX(startX);

    setRanges((prevRanges) => prevRanges.filter((range) => range.id !== canvasId));

    const handleMouseUp = () => {
      handleCanvasMouseUp(canvasId);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mouseup", handleMouseUp);

    e.preventDefault();
  };

  // 선택 범위 드래그 진행
  const handleCanvasMouseMove = (e: React.MouseEvent, canvasId: number) => {
    if (!dragging || draggingHandle) return;

    const canvas = e.target as HTMLCanvasElement;
    const canvasRect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - canvasRect.left;

    const start = Math.min(dragStartX, mouseX);
    const end = Math.max(dragStartX, mouseX);

    const startTime = (start / canvasRect.width) * duration;
    const endTime = (end / canvasRect.width) * duration;

    const newSelection = { id: canvasId, start: startTime, end: endTime };
    setSelectionRange(newSelection);
    selectionRangeRef.current = newSelection;
    setSelectedRangeId(canvasId);
  };

  // 선택 범위 드래그 종료
  const handleCanvasMouseUp = (canvasId: number) => {
    setDragging(false);

    const selectionRange = selectionRangeRef.current;
    if (!selectionRange) return;

    setRanges((prevRanges) => {
      const rangeIndex = prevRanges.findIndex((range) => range.id === canvasId);
      if (rangeIndex > -1) {
        return prevRanges.map((range) =>
          range.id === canvasId ? { ...range, start: selectionRange.start, end: selectionRange.end } : range
        );
      } else {
        return [...prevRanges, { id: canvasId, start: selectionRange.start, end: selectionRange.end }];
      }
    });

    setSelectionRange(null);
    selectionRangeRef.current = null;
  };

  // 선택 범위 삭제
  const handleRangeRemove = () => {
    if (!selectedRangeId) {
      alert("삭제할 범위를 선택해주세요.");
      return;
    }

    setSelectionRange(null);
    setRanges((prevRanges) => prevRanges.filter((range) => range.id !== selectedRangeId));
    setSelectedRangeId(null);
  };

  // 선택 범위 병합 처리 함수
  const handleMerge = async () => {
    if (!ranges || ranges.length === 0) {
      alert("병합할 범위를 선택해 주세요.");
      return;
    }

    setIsLoading(true);

    try {
      // 1. 시작 시간 기준으로 정렬
      let adjustedRanges = [...ranges].sort((a, b) => a.start - b.start);

      // 2. 겹치는 부분 조정 및 완전 포함된 범위 제거
      let mergedRanges = [adjustedRanges[0]]; // 첫 번째 범위는 유지

      for (let i = 1; i < adjustedRanges.length; i++) {
        let prevRange = mergedRanges[mergedRanges.length - 1]; // 마지막으로 추가된 범위
        let currRange = adjustedRanges[i];

        if (prevRange.end > currRange.start) {
          // 겹칠 경우 시작 조정
          currRange.start = prevRange.end;

          // 시작이 끝보다 크거나 같으면 삭제
          if (currRange.start >= currRange.end) {
            continue;
          }
        }

        // 완전 포함된 범위 제거
        if (prevRange.start <= currRange.start && prevRange.end >= currRange.end) {
          continue;
        }

        mergedRanges.push(currRange);
      }

      // 업데이트된 ranges 상태 반영
      setRanges(mergedRanges);

      modifyM3U8(mergedRanges);
    } catch (error) {
      console.error("비디오 병합 중 오류 발생:", error);
    } finally {
      setIsLoading(false);
    }
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
  const handleMouseDownHandle = (rangeId: number, handleType: "start" | "end", event: React.MouseEvent) => {
    event.preventDefault();
    setDragging(true);
    setDraggingHandle(handleType);
    setSelectedRangeId(rangeId);
  };

  // 선택 범위 핸들 드래그 진행
  const handleMouseMove = (e: MouseEvent) => {
    if (!draggingHandle || !selectedRangeId || !canvasRef.current) return;

    e.preventDefault();

    // 선택된 캔버스의 좌표를 가져옴
    const canvas = canvasRef.current;
    const canvasRect = canvas.getBoundingClientRect();

    // 마우스의 상대 위치 계산
    const mouseX = e.clientX - canvasRect.left;

    // 범위를 비율에 맞게 변환
    const time = (mouseX / canvasRect.width) * duration;

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

  const addCanvas = () => {
    setCanvases((prev) => [...prev, { id: Date.now() }]);
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
                height: 280,
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
              visibility: timelineImages.length === 0 ? "hidden" : "visible",
            }}
          />
        </div>

        <div style={{ width: "100%" }}>
          <div
            className="timeline-container"
            style={{
              position: "relative",
              display: "flex",
              marginLeft: "auto",
              justifyContent: "flex-end",
              backgroundColor: "#191b1d",
              height: "30px",
              marginBottom: "10px",
            }}
          >
            {timelineImages.map((thumbnail, index) => {
              return (
                <div
                  key={index}
                  className="timeline-thumbnail"
                  style={{ borderRight: "1px solid #333", width: "160px", height: "30px" }}
                >
                  <div className="timestamp" style={{ paddingLeft: "5px" }}>
                    {formatTime(thumbnail)}
                  </div>
                </div>
              );
            })}
            <canvas
              ref={canvasRef}
              className="timeline-canvas"
              width={160}
              height={90}
              style={{ backgroundColor: "#191b1d", opacity: 0.5 }}
            />
          </div>
          <div className="timeline-wrapper">
            {canvases.map((canvas) => (
              <div key={canvas.id} style={{ position: "relative", display: "flex", gap: "10px", alignItems: "center" }}>
                <canvas
                  id={canvas.id.toString()}
                  width={800}
                  height={35}
                  style={{
                    position: "relative",
                    backgroundColor: "#f1f1f1",
                    cursor: "pointer",
                    opacity: 0.5,
                  }}
                  onDoubleClick={(e) => handleCanvasDoubleClick(e)}
                  onMouseDown={(e) => handleCanvasMouseDown(e, canvas.id)}
                  onMouseMove={(e) => handleCanvasMouseMove(e, canvas.id)}
                  onMouseUp={() => handleCanvasMouseUp(canvas.id)}
                />
                {ranges.map((range) => {
                  if (range.id !== canvas.id) return null;

                  return (
                    <div
                      key={range.id}
                      style={{
                        position: "absolute",
                        left: `${(range.start / duration) * 100}%`,
                        width: `${((range.end - range.start) / duration) * 100}%`,
                        height: "33px",
                        border: selectedRangeId === range.id ? "2px solid #0056b3" : "2px solid rgb(204, 204, 204)",
                        backgroundColor: "#689c74",
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedRangeId(range.id)}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: "translate(-50%, -50%)",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                      >
                        {formatTime(range.start)} - {formatTime(range.end)}
                      </span>
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
                  );
                })}

                {selectionRange && selectionRange.id === canvas.id && (
                  <div
                    className="selection-range"
                    style={{
                      left: `${(selectionRange.start / duration) * 100}%`,
                      width: `${((selectionRange.end - selectionRange.start) / duration) * 100}%`,
                      backgroundColor: "#689c74",
                      height: "33px",
                      marginTop: "1px",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="controls">
          <button onClick={addCanvas} className="canvas-btn">
            Add
          </button>
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

export default TimestampAdder;
