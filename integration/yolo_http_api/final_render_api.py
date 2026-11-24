import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"


import cv2
from ultralytics import YOLO
import time
import numpy as np
import pandas as pd
from datetime import datetime
from collections import defaultdict
from render_reporter import RenderReporter
reporter = RenderReporter()



# =====================================================
# 載入 YOLO 模型
# =====================================================

print("載入模型中...")

model = YOLO("best (9).pt")

print("模型類別:")
print(model.names)



# =====================================================
# Camera
# =====================================================

cap = cv2.VideoCapture(0)


if not cap.isOpened():
    print("❌ 無法開啟鏡頭")
    exit()


print("✅ Camera OK")
print("按 q 離開")



# =====================================================
# ROI 偵測區域
# 避免人或背景被辨識
# =====================================================

ROI_X1 = 0
ROI_Y1 = 150

ROI_X2 = 640
ROI_Y2 = 480



# =====================================================
# 參數
# =====================================================

detect_interval = 0.5

last_detect_time = 0


last_detections = []



# =====================================================
# 類別
# =====================================================

TARGET_CLASSES = [

    "correction-tape",

    "defect",

    "eraser"

]



# =====================================================
# 良率統計
# =====================================================

good_count = 0

defect_count = 0


eraser_count = 0



# =====================================================
# 防止重複計算
# 紀錄已完成物件
# =====================================================

counted_objects = set()



# =====================================================
# CSV紀錄
# =====================================================

records = []



# =====================================================
# 簡易追蹤 ID
# =====================================================

object_memory = {}

next_id = 0



def get_object_id(center):

    global next_id


    cx, cy = center


    for oid, old_center in object_memory.items():

        ox, oy = old_center


        distance = (
            (cx-ox)**2 +
            (cy-oy)**2
        ) ** 0.5


        if distance < 50:

            object_memory[oid] = center

            return oid



    oid = next_id

    next_id += 1


    object_memory[oid] = center


    return oid





# =====================================================
# 主迴圈
# =====================================================


while True:


    ret, frame = cap.read()


    if not ret:
        break



    now = time.time()



    # =================================================
    # YOLO
    # =================================================

    if now - last_detect_time >= detect_interval:


        last_detect_time = now


        detections = []



        roi = frame[
            ROI_Y1:ROI_Y2,
            ROI_X1:ROI_X2
        ]



        results = model(

            roi,

            conf=0.25,

            imgsz=640,

            verbose=False

        )



        for r in results:


            for box in r.boxes:



                x1,y1,x2,y2 = (
                    box.xyxy[0]
                    .int()
                    .tolist()
                )


                # 加回原始座標

                x1 += ROI_X1
                x2 += ROI_X1

                y1 += ROI_Y1
                y2 += ROI_Y1



                cls_id = int(box.cls[0])

                conf = float(box.conf[0])

                class_name = model.names[cls_id]



                if class_name not in TARGET_CLASSES:

                    continue



                # 框大小限制

                area = (
                    (x2-x1)
                    *
                    (y2-y1)
                )


                frame_area = (
                    frame.shape[0]
                    *
                    frame.shape[1]
                )


                if area/frame_area > 0.4:

                    continue



                cx = int(
                    (x1+x2)/2
                )

                cy = int(
                    (y1+y2)/2
                )



                oid = get_object_id(
                    (cx,cy)
                )



                detections.append({

                    "id":oid,

                    "class":class_name,

                    "conf":conf,

                    "center":(
                        cx,
                        cy
                    ),

                    "box":(
                        x1,
                        y1,
                        x2,
                        y2
                    )

                })



                # ======================
                # 只計算一次
                # ======================


                if oid not in counted_objects:


                    counted_objects.add(oid)



                    if class_name == "correction-tape":

                        good_count += 1



                    elif class_name == "defect":

                        defect_count += 1



                    elif class_name == "eraser":

                        eraser_count += 1



                records.append({

                    "time":
                    datetime.now(),

                    "id":
                    oid,

                    "class":
                    class_name,

                    "confidence":
                    conf,

                    "X":
                    cx,

                    "Y":
                    cy

                })



        # 同影格將瑕疵小框與產品大框配對，避免把 defect 當成一件產品。
        products = [d for d in detections if d["class"] in ("correction-tape", "eraser")]
        defects = [d for d in detections if d["class"] == "defect"]
        for obj in products:
            x1, y1, x2, y2 = obj["box"]
            has_defect = any(x1 <= d["center"][0] <= x2 and y1 <= d["center"][1] <= y2 for d in defects)
            # 暫時以同畫面內配對結果判定；實際生產需再驗證漏檢、遮擋與追蹤 ID 穩定性。
            reporter.report(obj["id"], obj["class"], "NG" if has_defect else "OK")

        last_detections = detections





    # =================================================
    # 良率
    # =================================================


    total = (
        good_count +
        defect_count
    )


    if total > 0:

        yield_rate = (
            good_count /
            total *
            100
        )

    else:

        yield_rate = 0




    # =================================================
    # ROI 顯示
    # =================================================


    cv2.rectangle(

        frame,

        (
            ROI_X1,
            ROI_Y1
        ),

        (
            ROI_X2,
            ROI_Y2
        ),

        (255,255,0),

        2

    )




    # =================================================
    # 物件框
    # =================================================


    for d in last_detections:


        x1,y1,x2,y2 = d["box"]

        cx,cy = d["center"]



        label = (
            f"ID:{d['id']} "
            f"{d['class']} "
            f"{d['conf']:.2f}"
        )



        cv2.rectangle(

            frame,

            (x1,y1),

            (x2,y2),

            (0,255,0),

            2

        )



        cv2.circle(

            frame,

            (cx,cy),

            5,

            (0,0,255),

            -1

        )



        cv2.putText(

            frame,

            label,

            (x1,y1-10),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.55,

            (0,255,0),

            2

        )



        cv2.putText(

            frame,

            f"X:{cx} Y:{cy}",

            (cx,cy),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.55,

            (0,0,255),

            2

        )




    # =================================================
    # 即時良率文字
    # =================================================


    cv2.putText(

        frame,

        f"GOOD : {good_count}",

        (20,40),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.8,

        (0,255,0),

        2

    )



    cv2.putText(

        frame,

        f"DEFECT : {defect_count}",

        (20,80),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.8,

        (0,0,255),

        2

    )



    cv2.putText(

        frame,

        f"YIELD : {yield_rate:.2f}%",

        (20,120),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.8,

        (255,255,0),

        2

    )





    # =================================================
    # 即時圓餅圖
    # =================================================


    chart = np.zeros(

        (220,220,3),

        dtype=np.uint8

    )


    if total > 0:


        good_angle = int(

            360 *
            good_count /
            total

        )


        cv2.ellipse(

            chart,

            (110,110),

            (80,80),

            0,

            0,

            good_angle,

            (0,255,0),

            -1

        )


        cv2.ellipse(

            chart,

            (110,110),

            (80,80),

            0,

            good_angle,

            360,

            (0,0,255),

            -1

        )



    cv2.putText(

        chart,

        "YIELD",

        (70,30),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.6,

        (255,255,255),

        2

    )



    cv2.putText(

        chart,

        f"{yield_rate:.1f}%",

        (60,125),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.8,

        (255,255,255),

        2

    )


    h,w,_ = frame.shape


    frame[
        0:220,
        w-220:w
    ] = chart




    reporter.frame(frame)

    cv2.imshow(

        "YOLO Quality System",

        frame

    )



    if cv2.waitKey(1)&0xff == ord("q"):

        break




# =====================================================
# 結束
# =====================================================


cap.release()

cv2.destroyAllWindows()



df = pd.DataFrame(records)


df.to_csv(

    "quality_result.csv",

    index=False,

    encoding="utf-8-sig"

)



print("====================")

print("完成")

print(
    "良品:",
    good_count
)

print(
    "瑕疵:",
    defect_count
)

print(
    "良率:",
    round(yield_rate,2),
    "%"
)

print(
    "CSV 已輸出 quality_result.csv"
)