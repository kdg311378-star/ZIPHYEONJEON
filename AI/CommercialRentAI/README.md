# CommercialRentAI

상가 월 임대료 예측 전용 FastAPI + LightGBM 서비스입니다.

기존 `AI/MolitAI`와 분리되어 있으며, 공유하는 부분은 Spring Boot가 Python AI API를 호출하는 방식뿐입니다.

## 실행

```powershell
cd AI\CommercialRentAI
pip install -r requirements.txt
python main.py
```

기본 포트는 `8010`입니다.

## 학습

로컬에서 학습할 때:

```powershell
python train_commercial_rent.py --data-dir "D:\문서\자료_프로젝트\집현전\상가 임대료AI"
```

모델은 `models/rent_h1m.pkl`, `models/rent_h3m.pkl`, `models/rent_h6m.pkl`로 저장됩니다.

Google Colab A100에서 학습할 때는 `CommercialRentAI_colab_train.ipynb`를 사용하세요.

```python
from google.colab import drive
drive.mount('/content/drive')
```

노트북과 학습 데이터는 Google Drive의 `내 드라이브/Colab Notebooks/상가 임대료 AI` 폴더에 둡니다.

```python
!python train_commercial_rent.py \
  --data-dir "/content/drive/MyDrive/Colab Notebooks/상가 임대료 AI" \
  --output-dir "/content/drive/MyDrive/Colab Notebooks/상가 임대료 AI" \
  --device auto \
  --zip-output
```

`--device auto`는 Colab에서 LightGBM GPU 학습을 먼저 시도하고, GPU LightGBM 사용이 불가능하면 CPU로 자동 전환합니다. 학습이 끝나면 Drive의 `Colab Notebooks/상가 임대료 AI/commercial_rent_ai_outputs.zip` 안에 `models/`와 `config/`가 들어 있습니다. 이 두 폴더를 로컬 `AI/CommercialRentAI` 아래에 복사한 뒤 `python main.py`를 실행하면 API가 학습된 모델을 로드합니다.

## API

`POST /predict/commercial-rent`

응답 단위는 `만원/월`입니다.
