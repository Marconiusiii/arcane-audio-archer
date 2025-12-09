/*
	Arcane Archer — Full Game Logic + Audio
 */

const GameState = {
	IDLE: "idle",
	TARGET_RISING: "target_rising",
	SETTING_ANGLE: "setting_angle",
	SETTING_POWER: "setting_power",
	FLIGHT: "flight",
	ROUND_END: "round_end",
	GAME_OVER: "game_over"
};

const game = {
	state: GameState.IDLE,
	round: 1,
	score: 0,
	arrowsLeft: 5,
	maxArrows: 5,

	lastShot: { angleNorm: null, powerNorm: null },
	currentShot: { angleNorm: null, powerNorm: null },

	target: { distanceNorm: 0.8, heightNorm: 0.4 }
};

// Difficulty tuning constants
const DIFFICULTY = {
	// Horizontal: round 1 → 6 expands from 0.0 (center) to 1.0 (far right)
	horizMinStart: 0.7,   // center
	horizMinEnd:   0.5,   // stays center
	horizMaxStart: 0.73,   // center
	horizMaxEnd:   1.0,   // far right

	// Vertical: round 1 → 6 expands from low→high but always hittable
	vertMinStart: 0.15,
	vertMinEnd:   0.10,
	vertMaxStart: 0.55,
	vertMaxEnd:   0.90,

	// Hitbox tightening from round 5 → 10
	hitDistStart: 0.18,
	hitDistEnd:   0.10,
	hitHeightStart: 0.22,
	hitHeightEnd:   0.12
};

const BALLISTICS = {
	gravity: 1.25,        // slightly stronger to allow overshoots but not infinite flight
	fieldLength: 1.4,     // you already set this, keep it
	minAngleDeg: 18,
	maxAngleDeg: 62,
	minPower: 0.25,
	maxPower: 1.15        // allow stronger overshoots when power is high
};

function computeShotKinematics(angleNorm, powerNorm) {
	const g = BALLISTICS.gravity;

	const angleDeg =
		BALLISTICS.minAngleDeg +
		angleNorm * (BALLISTICS.maxAngleDeg - BALLISTICS.minAngleDeg);

	const rad = angleDeg * (Math.PI / 180);

	const power =
		BALLISTICS.minPower +
		powerNorm * (BALLISTICS.maxPower - BALLISTICS.minPower);

	const vx = Math.cos(rad) * power;
	const vy = Math.sin(rad) * power;

	// analytical flight time until y = 0 (landing)
	const tFlight = (vy + Math.sqrt(vy * vy + 2 * g * 0.25)) / g;
	const horizontal = vx * tFlight;

	let rangeNorm = Math.min(1, horizontal / BALLISTICS.fieldLength);
	let heightNorm = Math.min(1, (vy * (tFlight * 0.5) - 0.5 * g * (tFlight * 0.5) ** 2) + 0.35);

	return { vx, vy, tFlight, rangeNorm, heightNorm };
}

/* DOM */
const roundValueEl = document.getElementById("round-value");
const scoreValueEl = document.getElementById("score-value");
const arrowsValueEl = document.getElementById("arrows-value");
const stateTextEl = document.getElementById("state-text");
const instructionsSection = document.getElementById("instructions-section");
const hudSection = document.getElementById("hud-section");
const footerSection = document.getElementById("footer");

const startBtn = document.getElementById("start-btn");
const setAimBtn = document.getElementById("set-aim-btn");

const liveRegion = document.getElementById("live-region");
const shotToken = document.getElementById("shot-token");

/* High Score DOM */
const highscoreList = document.getElementById("highscore-list");
const highscoreLoading = document.getElementById("hs-loading");
const highscoreDialog = document.getElementById("highscore-dialog");
const highscoreForm = document.getElementById("highscore-form");
const highscoreInitials = document.getElementById("hs-initials");
const highscoreFinalScoreDisplay = document.getElementById("final-score-display");
const highscoreSubmitBtn = document.getElementById("hs-submit-btn");
const highscoreCancelBtn = document.getElementById("hs-cancel-btn");

/* This ID *exists* in your HTML and must be referenced */
const highscoreSection = document.getElementById("highscore-section");

/* High Score System */
const highscoreURL = "archerHighScore.php";
let lastGameScore = 0;

/* Inert helpers */
function enableHighscoresInert() {
	if (highscoreSection) {
		highscoreSection.setAttribute("inert", "");
	}
}

function disableHighscoresInert() {
	if (highscoreSection) {
		highscoreSection.removeAttribute("inert");
	}
}

function loadHighScores() {
	if (!highscoreList || !highscoreLoading) return;

	fetch(highscoreURL + "?action=list", {
		method: "GET",
		headers: { "Accept": "application/json" }
	})
		.then(r => r.json())
		.then(data => {
			if (!data || !data.success || !Array.isArray(data.scores)) {
				highscoreLoading.textContent = "No scores yet.";
				return;
			}

			highscoreList.innerHTML = "";
			data.scores.forEach(entry => {
				const li = document.createElement("li");
				li.textContent = entry.initials + ", " + entry.score;
				highscoreList.appendChild(li);
			});

			highscoreList.hidden = false;
			highscoreLoading.hidden = true;
		})
		.catch(() => {
			highscoreLoading.textContent = "Unable to load scores.";
		});
}

function openHighScoreDialog(finalScore) {
	lastGameScore = finalScore;
	highscoreFinalScoreDisplay.textContent = String(finalScore);
	highscoreInitials.value = "";
	announce(`Game Over, new high score of ${finalScore}`);

	/* High score submission dialog must be interactive → remove inert */
	disableHighscoresInert();

	highscoreDialog.showModal();

	/* Reliable focus transfer */
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			if (highscoreInitials) {
				highscoreInitials.focus();
			}
		});
	});
}

/* Cancel button closes dialog and returns focus */
if (highscoreCancelBtn && highscoreDialog) {
	highscoreCancelBtn.addEventListener("click", () => {
		highscoreDialog.close("cancel");
		if (startBtn) startBtn.focus();
	});
}

/* If dialog is closed via Escape or Cancel */
if (highscoreDialog) {
	highscoreDialog.addEventListener("close", () => {
		if (highscoreDialog.returnValue !== "submit" && startBtn) {
			startBtn.focus();
		}
	});
}

/* SUBMIT HANDLER */
if (highscoreForm) {
	highscoreForm.addEventListener("submit", e => {
		e.preventDefault();

		if (!highscoreInitials) return;

		const raw = highscoreInitials.value.trim().toUpperCase();
		if (!raw.match(/^[A-Z0-9]{1,3}$/)) {
			alert("Please enter 1 to 3 letters or numbers for your initials.");
			highscoreInitials.focus();
			return;
		}

		const body = new URLSearchParams();
		body.append("action", "submit");
		body.append("initials", raw);
		body.append("score", String(lastGameScore));

		fetch(highscoreURL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"Accept": "application/json"
			},
			body
		})
			.then(r => r.json())
			.then(data => {
				if (!data || !data.success) {
					alert("Unable to submit score.");
					return;
				}

				highscoreDialog.close("submit");
				loadHighScores();

				if (startBtn) startBtn.focus();
			})
			.catch(() => {
				alert("Unable to submit score.");
			});
	});
}

document.addEventListener("DOMContentLoaded", () => {
	loadHighScores();
});

/* Audio */
let audioCtx = null;
let audioUnlocked = false;

const audioSettings = {
	masterGain: 0.8,

	angleSweep: {
		baseFrequency: 360,
		frequencyRange: 420,
		panLeft: -1,
		panRight: -0.2,
		sweepMsPerCycle: 1600,
		pauseMs: 120
	},

	powerSweep: {
		baseFrequency: 300,
		frequencyRange: 300,
		panLeft: -1,
		panRight: 1,
		sweepMsPerCycle: 1400,
		pauseMs: 120
	},

	lastShotPing: { frequency: 1300, gain: 0.5 },

	targetRise: {
		steps: 8,
		stepIntervalMs: 90,
		baseFrequency: 420,
		stepFrequencyDelta: 40
	},

	targetIdlePing: { frequency: 900, durationMs: 80, intervalMs: 2000, gain: 0.18 },

	arrowFlight: {
		durationMs: 1500,
		whistleCenter: 1200,
		whistleVar: 300,
		filterStart: 1600,
		filterEnd: 600
	},

	hit: { durationMs: 220, frequency: 200, gain: 0.7 },
	miss: { durationMs: 220, frequency: 150, gain: 0.6 },

	bow: { base: 1000, end: 400, gain: 0.7 },

	ui: { confirm: { frequency: 650, durationMs: 120, gain: 0.4 } }
};

let angleRAF = null, powerRAF = null;
let angleOsc = null, angleGain = null, anglePan = null;
let powerOsc = null, powerGain = null, powerPan = null, powerNoise = null;

let angleLastIndex = -1;
let lastPowerIndex = -1;

let targetPingInterval = null;

/* Utilities */
function ensureAudioContext() {
	if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	if (audioCtx.state === "suspended") audioCtx.resume();
	audioUnlocked = true;
}

function announce(msg) {
	liveRegion.textContent = "";
	setTimeout(() => { liveRegion.textContent = msg; }, 5);
}

function setHUDInert(state) {
	state ? hudSection.setAttribute("inert", "") : hudSection.removeAttribute("inert");
}
function setInstructionsInert(state) {
	state ? instructionsSection.setAttribute("inert", "") : instructionsSection.removeAttribute("inert");
}

function setFooterInert(state) {
	if (footerSection) {
		state ? footerSection.setAttribute("inert", "") : footerSection.removeAttribute("inert");
	}
}


function setHighscoreInert(isInert) {
	if (!highscoreSection) return;
	if (isInert) {
		highscoreSection.setAttribute("inert", "");
	} else {
		highscoreSection.removeAttribute("inert");
	}
}

function setStartGameInert(state) {
	state ? startBtn.setAttribute("inert", "") : startBtn.removeAttribute("inert");
}

function updateHUD() {
	roundValueEl.textContent = game.round;
	scoreValueEl.textContent = game.score;
	arrowsValueEl.textContent = game.arrowsLeft;
}

/* Simple beep helper */
function playBeep(freq, durMs, opts = {}) {
	if (!audioUnlocked) return;
	const now = audioCtx.currentTime;
	const osc = audioCtx.createOscillator();
	const gain = audioCtx.createGain();
	const pan = audioCtx.createStereoPanner();

	osc.type = opts.type || "sine";
	osc.frequency.value = freq;
	pan.pan.value = opts.pan ?? 0;
	gain.gain.value = (opts.gain ?? 1) * audioSettings.masterGain;

	osc.connect(pan);
	pan.connect(gain);
	gain.connect(audioCtx.destination);
	osc.start(now);

	let end = now + durMs / 1000;
	gain.gain.exponentialRampToValueAtTime(0.0001, end);
	osc.stop(end + 0.05);
}

/* Bow twang */
function playBowTwang() {
	if (!audioUnlocked) return;

	const now = audioCtx.currentTime;
	const osc = audioCtx.createOscillator();
	const gain = audioCtx.createGain();
	const pan = audioCtx.createStereoPanner();

	osc.type = "sawtooth";
	osc.frequency.setValueAtTime(audioSettings.bow.base, now);
	osc.frequency.linearRampToValueAtTime(audioSettings.bow.end, now + 0.12);

	gain.gain.setValueAtTime(audioSettings.bow.gain, now);
	pan.pan.value = -0.8;

	osc.connect(pan);
	pan.connect(gain);
	gain.connect(audioCtx.destination);

	gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
	osc.start(now);
	osc.stop(now + 0.16);

	// tiny tick
	playBeep(1600, 40, { gain: 0.3, pan: -0.8 });
}

/* Target idle ping */
function startTargetIdlePings() {
	stopTargetPings();
	if (!audioUnlocked) return;

	const cfg = audioSettings.targetIdlePing;
	targetPingInterval = setInterval(()=>{
		let vol = 0.2 + 0.7*(1-game.target.heightNorm);
		const panVal = targetPanFromDistance(game.target.distanceNorm);
		playBeep(cfg.frequency, cfg.durationMs, {gain:cfg.gain*vol, pan:panVal});
	}, cfg.intervalMs);
}

function stopTargetPings() {
	if (targetPingInterval) {
		clearInterval(targetPingInterval);
		targetPingInterval = null;
	}
}

function startTargetRise() {
	setState(GameState.TARGET_RISING, "Target rising...");
	announce(`Round ${game.round}, ${game.score} points.`);

	const cfg = audioSettings.targetRise;
	const steps = cfg.steps;

	// Pan chain sounds to target's horizontal position
	const chainPan = targetPanFromDistance(game.target.distanceNorm);

	for (let i = 0; i <= steps; i++) {
		const t = i * cfg.stepIntervalMs;
		const freq = cfg.baseFrequency + cfg.stepFrequencyDelta * i;

		// Height factor already in your original code
		const height = (game.target.heightNorm * i) / steps;
		const vol = 0.45 * (1 - height);

		setTimeout(() => {
			playBeep(freq, cfg.stepIntervalMs * 0.7, {
				gain: vol,
				pan: chainPan,  // <<–– This is the only change you needed
				type: "square"
			});
		}, t);
	}

	const total = steps * cfg.stepIntervalMs + 200;

	setTimeout(() => {
		if (game.state !== GameState.TARGET_RISING) return;

		// Location bell ping exactly where the target is horizontally
		const locPan = targetPanFromDistance(game.target.distanceNorm);
		playBeep(1350, 180, {
			gain: 0.5,
			pan: locPan,
			type: "sine"
		});

		startTargetIdlePings();
		startAnglePhase();
	}, total);
}

/* Angle sweep – modern tone bubbles in the left channel */
function stopAngleSweep() {
	if (angleRAF) cancelAnimationFrame(angleRAF);
	angleRAF = null;
	angleLastIndex = -1;

	if (angleOsc) {
		try { angleOsc.stop(); } catch (e) {}
		angleOsc = null;
	}
}

function startAngleSweep(lastNorm) {
	ensureAudioContext();
	stopAngleSweep();

	const cfg = audioSettings.angleSweep;
	const sweepSec = cfg.sweepMsPerCycle / 1000;
	const pauseSec = cfg.pauseMs / 1000;
	const cycle = sweepSec + pauseSec;
	const startTime = audioCtx.currentTime;

	const scale = [260, 310, 370, 440, 520, 620, 740];

	function playAngleBubble(freq) {
		const now = audioCtx.currentTime;

		const osc = audioCtx.createOscillator();
		const gain = audioCtx.createGain();
		const pan = audioCtx.createStereoPanner();

		osc.type = "sine";
		osc.frequency.value = freq;

		pan.pan.value = cfg.panLeft ?? -0.8;
		gain.gain.setValueAtTime(0, now);
		gain.gain.linearRampToValueAtTime(0.12 * audioSettings.masterGain, now + 0.03);
		gain.gain.linearRampToValueAtTime(0.0, now + 0.15);

		osc.connect(pan);
		pan.connect(gain);
		gain.connect(audioCtx.destination);

		osc.start(now);
		osc.stop(now + 0.18);
	}

	let lastDir = 0;

	function tick() {
		const t = audioCtx.currentTime - startTime;
		const c = t % cycle;

		if (c <= sweepSec) {
			let n = c / sweepSec;
			const cycleIndex = Math.floor(t / cycle);

			if (cycleIndex % 2 === 1) n = 1 - n;

			game.currentShot.angleNorm = n;

			let idx = Math.floor(n * 6.999);
			if (idx < 0) idx = 0;
			if (idx > 6) idx = 6;

			if (idx !== angleLastIndex) {
				angleLastIndex = idx;
				playAngleBubble(scale[idx]);
			}

			if (typeof lastNorm === "number") {
				const diff = n - lastNorm;
				const dir = diff >= 0 ? 1 : -1;
				if (Math.abs(diff) < 0.03 && dir !== lastDir) {
					lastDir = dir;
					playBeep(audioSettings.lastShotPing.frequency, 70, {
						gain: audioSettings.lastShotPing.gain,
						pan: -0.4
					});
				}
			}
		}

		angleRAF = requestAnimationFrame(tick);
	}

	tick();
}

/* Power sweep – smooth modern pad from left toward center */
function stopPowerSweep() {
	if (powerRAF) cancelAnimationFrame(powerRAF);
	powerRAF = null;

	if (powerOsc) {
		try { powerOsc.stop(); } catch (e) {}
		powerOsc = null;
	}
	if (powerGain) {
		powerGain = null;
	}
	if (powerPan) {
		powerPan = null;
	}
}

function startPowerSweep(lastNorm) {
	ensureAudioContext();
	stopPowerSweep();

	const cfg = audioSettings.powerSweep;
	const now = audioCtx.currentTime;

	powerOsc = audioCtx.createOscillator();
	powerGain = audioCtx.createGain();
	powerPan = audioCtx.createStereoPanner();

	powerOsc.type = "sine";
	powerOsc.frequency.value = 260;

	powerGain.gain.value = 0.001;
	powerPan.pan.value = cfg.panLeft;

	powerOsc.connect(powerPan);
	powerPan.connect(powerGain);
	powerGain.connect(audioCtx.destination);

	powerOsc.start(now);

	const sweepSec = cfg.sweepMsPerCycle / 1000;
	const pauseSec = cfg.pauseMs / 1000;
	const cycle = sweepSec + pauseSec;
	const startTime = now;

	let lastDir = 0;

	function tick() {
		const t = audioCtx.currentTime - startTime;
		const c = t % cycle;

		if (c <= sweepSec) {
			let n = c / sweepSec;
			const cycleIndex = Math.floor(t / cycle);
			if (cycleIndex % 2 === 1) n = 1 - n;

			game.currentShot.powerNorm = n;

			const minPitch = 240;
			const maxPitch = 420;
			const pitch = minPitch + (maxPitch - minPitch) * n;
			powerOsc.frequency.setValueAtTime(pitch, audioCtx.currentTime);

			const baseGain = 0.06;
			const extraGain = 0.08;
			const g = (baseGain + extraGain * n) * audioSettings.masterGain;
			powerGain.gain.setValueAtTime(g, audioCtx.currentTime);

			const startPan = cfg.panLeft;
			const endPan = 0.0;
			const panVal = startPan + (endPan - startPan) * n;
			powerPan.pan.setValueAtTime(panVal, audioCtx.currentTime);

			if (typeof lastNorm === "number") {
				const diff = n - lastNorm;
				const dir = diff >= 0 ? 1 : -1;
				if (Math.abs(diff) < 0.03 && dir !== lastDir) {
					lastDir = dir;
					playBeep(audioSettings.lastShotPing.frequency, 70, {
						gain: audioSettings.lastShotPing.gain,
						pan: 0.6
					});
				}
			}
		} else {
			powerGain.gain.setValueAtTime(0.001 * audioSettings.masterGain, audioCtx.currentTime);
		}

		powerRAF = requestAnimationFrame(tick);
	}

	tick();
}

function playArrowFlight(angleNorm, powerNorm) {
	if (!audioUnlocked) return;

	const flight = {
		steps: 72,
		volumeBase: 0.12,
		volumeArcBoost: 0.26,
		panStrength: 1,
		startFreq: 1500,
		apexFreqBoost: 320,
		endFreqDrop: 750,
		filterQ: 3.2
	};

	const cfg = audioSettings.arrowFlight;
	const now = audioCtx.currentTime;
	const dur = cfg.durationMs / 1000;

	const kin = computeShotKinematics(angleNorm, powerNorm);
	const { vx, vy, tFlight } = kin;
	const g = BALLISTICS.gravity;
	const fieldLength = BALLISTICS.fieldLength;

	playBowTwang();

	const noise = audioCtx.createBufferSource();
	const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 4, audioCtx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++) {
		data[i] = (Math.random() * 2 - 1) * 0.4;
	}
	noise.buffer = buffer;

	const filter = audioCtx.createBiquadFilter();
	filter.type = "bandpass";
	filter.Q.value = flight.filterQ;

	const gain = audioCtx.createGain();
	gain.gain.value = 0.0001;

	const pan = audioCtx.createStereoPanner();

	noise.connect(filter);
	filter.connect(pan);
	pan.connect(gain);
	gain.connect(audioCtx.destination);

	noise.start(now);

	const steps = flight.steps;
	const totalFlightTime = Math.max(tFlight, 0.6);

	for (let i = 0; i <= steps; i++) {
		const n = i / steps;
		const t = n * totalFlightTime;
		const at = now + n * dur;

		let x = vx * t;
		let y = vy * t - 0.5 * g * t * t;

		let xNorm = Math.max(0, Math.min(1, x / fieldLength));
		let heightNorm = Math.max(0, Math.min(1, y + 0.25));

		const panVal = (-1 + 2 * xNorm) * flight.panStrength;
		const vol = (flight.volumeBase + (1 - heightNorm) * flight.volumeArcBoost) * audioSettings.masterGain;

		const midLift = Math.sin(n * Math.PI);
		const freq =
			flight.startFreq +
			flight.apexFreqBoost * midLift -
			flight.endFreqDrop * n;

		filter.frequency.setValueAtTime(freq, at);
		pan.pan.setValueAtTime(panVal, at);
		gain.gain.setValueAtTime(vol, at);
	}

	const endTime = now + dur;
	gain.gain.linearRampToValueAtTime(0.0001, endTime);
	noise.stop(endTime);
}

function playMissLow(panValue) {
	if (!audioUnlocked) return;

	const now = audioCtx.currentTime;

	// Deep thud
	playBeep(110, 90, {
		gain: 0.75,
		pan: panValue,
		type: "sine"
	});

	// Juicy gravel burst
	const len = audioCtx.sampleRate * 0.18;
	const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
	const data = buffer.getChannelData(0);

	let last = 0;
	for (let i = 0; i < len; i++) {
		// Slightly wetter, deeper brown noise
		let val = (Math.random() * 2 - 1) * 0.28;
		last = (last + 0.028 * val) / 1.028;
		data[i] = last;
	}

	const noise = audioCtx.createBufferSource();
	noise.buffer = buffer;

	const filter = audioCtx.createBiquadFilter();
	filter.type = "lowpass";
	filter.frequency.value = 420;

	const gain = audioCtx.createGain();
	gain.gain.setValueAtTime(0.001, now);
	gain.gain.linearRampToValueAtTime(0.33, now + 0.03);
	gain.gain.linearRampToValueAtTime(0.0001, now + 0.18);

	const pan = audioCtx.createStereoPanner();
	pan.pan.value = panValue;

	noise.connect(filter);
	filter.connect(pan);
	pan.connect(gain);
	gain.connect(audioCtx.destination);

	noise.start(now + 0.02);
	noise.stop(now + 0.22);
}

function playHitSound() {
	if (!audioUnlocked) return;

	const now = audioCtx.currentTime;

	// Horizontal position from the target
	const panVal = typeof targetPanFromDistance === "function"
		? targetPanFromDistance(game.target.distanceNorm)
		: 0.9;

	// Vertical position influences loudness (closer to ground = slightly louder)
	const height = Math.max(0, Math.min(1, game.target.heightNorm));
	const heightGain = 0.6 + 0.4 * (1 - height);

	playBeep(180, 140, {
		gain: 0.9 * heightGain,
		pan: panVal
	});

	setTimeout(() => {
		playBeep(240, 200, {
			gain: 0.5 * heightGain,
			pan: panVal
		});
	}, 40);

	setTimeout(() => {
		playBeep(120, 120, {
			gain: 0.6 * heightGain,
			pan: panVal,
			type: "square"
		});
	}, 90);
}


function playMissHigh() {
	if (!audioUnlocked) return;

	const now = audioCtx.currentTime;

	playBeep(760, 120, {
		gain: 0.45,
		pan: 0.95,
		type: "sine"
	});

	setTimeout(() => {
		playBeep(540, 150, {
			gain: 0.25,
			pan: 0.95,
			type: "sine"
		});
	}, 140);

	setTimeout(() => {
		playBeep(420, 180, {
			gain: 0.15,
			pan: 0.92,
			type: "sine"
		});
	}, 260);
}

/* Game Logic */
function randomizeTarget(){
	const r = game.round;

	// Horizontal expansion completes by round 6
	const horizProgress = Math.min(r / 6, 1);

	const horizMin =
		DIFFICULTY.horizMinStart +
		(DIFFICULTY.horizMinEnd - DIFFICULTY.horizMinStart) * horizProgress;

	const horizMax =
		DIFFICULTY.horizMaxStart +
		(DIFFICULTY.horizMaxEnd - DIFFICULTY.horizMaxStart) * horizProgress;

	// Vertical expansion completes by round 6
	const vertProgress = Math.min(r / 6, 1);

	const vertMin =
		DIFFICULTY.vertMinStart +
		(DIFFICULTY.vertMinEnd - DIFFICULTY.vertMinStart) * vertProgress;

	const vertMax =
		DIFFICULTY.vertMaxStart +
		(DIFFICULTY.vertMaxEnd - DIFFICULTY.vertMaxStart) * vertProgress;

	// Apply random placement in scaled ranges
	game.target.distanceNorm = horizMin + Math.random() * (horizMax - horizMin);
	game.target.heightNorm = vertMin + Math.random() * (vertMax - vertMin);
}

function resetRoundState() {
	game.arrowsLeft = 5;
	game.currentShot.angleNorm = null;
	game.currentShot.powerNorm = null;
	updateHUD();
}

function beginRound() {
	game.arrowsLeft = 5;
	game.currentShot.angleNorm = null;
	game.currentShot.powerNorm = null;

	updateHUD();

	setHUDInert(false);
	setInstructionsInert(true);
	setStartGameInert(true);
	enableHighscoresInert();
	setFooterInert(true);


	setAimBtn.hidden = false;
	setState(GameState.TARGET_RISING, "Target rising…");

	randomizeTarget();
	startTargetRise();
}

function setState(s, msg) {
	game.state = s;
	stateTextEl.textContent = msg;
}

function startAnglePhase() {
	setState(GameState.SETTING_ANGLE, "Set angle.");
	announce("Angle.");
	startAngleSweep(game.lastShot.angleNorm);
}

function lockAngle() {
	stopAngleSweep();
	playBeep(
		audioSettings.ui.confirm.frequency,
		audioSettings.ui.confirm.durationMs,
		{ gain: audioSettings.ui.confirm.gain }
	);
	game.currentShot.angleNorm ??= 0.5;

	setState(GameState.SETTING_POWER, "Set power.");
	announce("Power.");
	startPowerSweep(game.lastShot.powerNorm);
}

function lockPowerAndFire() {
	stopPowerSweep();
	if (game.arrowsLeft <= 0) return;

	playBeep(
		audioSettings.ui.confirm.frequency,
		audioSettings.ui.confirm.durationMs,
		{ gain: audioSettings.ui.confirm.gain }
	);
	game.currentShot.powerNorm ??= 0.5;

	game.arrowsLeft--;
	updateHUD();

	setState(GameState.FLIGHT, "Arrow in flight…");
	shotToken.style.opacity = "1";
	shotToken.style.transition = `transform ${audioSettings.arrowFlight.durationMs}ms linear`;
	shotToken.style.transform = "translateX(260px)";

	playArrowFlight(game.currentShot.angleNorm, game.currentShot.powerNorm);

	setTimeout(() => resolveShot(), audioSettings.arrowFlight.durationMs + 200);
}

function targetPanFromDistance(distanceNorm) {
	// distanceNorm ∈ [0.5, 1] → pan ∈ [0.1, 1.0]
	const d = Math.max(0.5, Math.min(1, distanceNorm));
	return 0.1 + (d - 0.5) * (0.9 / 0.5);
}

function resolveShot(){
	shotToken.style.opacity="0";

	let angleNorm = game.currentShot.angleNorm ?? 0.5;
	let powerNorm = game.currentShot.powerNorm ?? 0.5;

	// Use shared ballistics model for target checking
	const kin = computeShotKinematics(angleNorm, powerNorm);
	const shotDistanceNorm = kin.rangeNorm;
	const shotHeightNorm = kin.heightNorm;

	// For audio: landing pan based on shot distance
	const landingPan = (shotDistanceNorm * 1.8) - 0.9;

	const dx = Math.abs(shotDistanceNorm - game.target.distanceNorm);
	const dy = Math.abs(shotHeightNorm - game.target.heightNorm);

	// Difficulty scaling for hitbox tightening (rounds 5 → 10)
	const hr = Math.min(Math.max((game.round - 5) / 5, 0), 1);

	const hitDistanceThreshold =
	DIFFICULTY.hitDistStart +
	(DIFFICULTY.hitDistEnd - DIFFICULTY.hitDistStart) * hr;

const hitHeightThreshold =
	DIFFICULTY.hitHeightStart +
	(DIFFICULTY.hitHeightEnd - DIFFICULTY.hitHeightStart) * hr;

const hit = (dx <= hitDistanceThreshold && dy <= hitHeightThreshold);

	game.lastShot.angleNorm = angleNorm;
	game.lastShot.powerNorm = powerNorm;

	stopTargetPings();

	if (hit) {
		return onHit();
	} else {
		if (shotHeightNorm < game.target.heightNorm) {
			// Too low
			playMissLow(landingPan);
			if (game.arrowsLeft > 1) {
				announce(`Too low, ${game.arrowsLeft} arrows left.`);
			} else {
				announce(`Too low, ${game.arrowsLeft} arrow left.`);
			}
		} else {
			// Too high
			playMissHigh();
			if (game.arrowsLeft > 1) {
				announce(`Too high, ${game.arrowsLeft} arrows left.`);
			} else {
				announce(`Too high, ${game.arrowsLeft} arrow left.`);
			}
		}

		return onMiss(true);
	}
}

function onHit() {
	playHitSound();

	let bonus = game.arrowsLeft * 100;
	let gained = 100 + bonus;
	game.score += gained;
	updateHUD();

	setState(GameState.ROUND_END, `Hit! +${gained} points.`);
	announce(`Hit! You earned ${gained} points.`);

	game.round++;
	updateHUD();

	// Step 1: Pause 1 second before announcing the next round
	setTimeout(() => {

		// Step 2: Announce Round for 2 seconds
		if (game.state === GameState.ROUND_END) {
			announce(`Round ${game.round}, ${game.score} points.`);
		}

		// Step 3: Begin the round after announcement has time to be heard
		setTimeout(() => {
			if (game.state === GameState.ROUND_END) {
				beginRound();
			}
		}, 2000);

	}, 1000);
}

// didPlaySound = true when resolveShot already handled sound + announcement
function onMiss(didPlaySound = false) {
	if (!didPlaySound) {
		playMissLow(0.9);
		if (game.arrowsLeft > 1) {
			announce(`${game.arrowsLeft} arrows left.`);
		} else {
			announce(`${game.arrowsLeft} arrow left.`);
		}
	}

	if (game.arrowsLeft > 0) {
		setState(GameState.SETTING_ANGLE, `Missed. ${game.arrowsLeft} left.`);
		setTimeout(() => {
			if (game.state === GameState.SETTING_ANGLE) {
				startTargetIdlePings();
				startAnglePhase();
		}
	}, 2500);
		return;
	}

	setState(GameState.GAME_OVER, `Game Over, Final Score: ${game.score}.`);
	announce(`Game over. Final Score: ${game.score}.`);
	setInstructionsInert(false);
	setFooterInert(false);


	setAimBtn.hidden = true;
	setStartGameInert(false);
	setHUDInert(true);
	disableHighscoresInert();

	game.lastShot.angleNorm = null
	game.lastShot.powerNorm = null

	if (game.score > 0) {
		openHighScoreDialog(game.score);
	}
}

function restartGame() {
	game.round = 1;
	game.score = 0;
	updateHUD();
	setState(GameState.IDLE, "Ready? Press Space or the Start Game button.");
	setAimBtn.hidden = true;
	setStartGameInert(false);
	setInstructionsInert(false);
	setHUDInert(true);
	setHighscoreInert(false);
	setFooterInert(false);
}

function handlePrimaryAction() {
	switch (game.state) {
		case GameState.IDLE:
			beginRound();
			break;
		case GameState.SETTING_ANGLE:
			lockAngle();
			break;
		case GameState.SETTING_POWER:
			lockPowerAndFire();
			break;
		case GameState.GAME_OVER:
			restartGame();
			break;
	}
}

window.addEventListener("keydown", e => {
	if (e.code === "Space" || e.code === "Enter") {

		// If the high score dialog is open, do NOT hijack Space/Enter.
		// Let the dialog and its form handle them normally.
		if (highscoreDialog && highscoreDialog.open) {
			return;
		}

		e.preventDefault();
		ensureAudioContext();
		handlePrimaryAction();
	}
});

startBtn.addEventListener("click", () => { ensureAudioContext(); handlePrimaryAction(); });
setAimBtn.addEventListener("click", () => { ensureAudioContext(); handlePrimaryAction(); });

/* Init */
window.addEventListener("load", () => {
	updateHUD();
	setHUDInert(true);
	setInstructionsInert(false);
	setAimBtn.hidden = true;
	setStartGameInert(false);
	setHighscoreInert(false); // scoreboard interactive on idle screen
});
