(function () {
  "use strict";

  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const METHOD_STEPS = {
    "1": {
      label: "Step 1",
      title: "Simulation teacher and value training",
      copy:
        "Train a privileged expert policy, checkpoint policies, and an expert value function in simulation. This stage provides scalable supervision before any real-world data is collected.",
      transfer:
        "No direct transfer yet. This stage builds the artifacts used to supervise world-model pretraining.",
      adapt:
        "No real-world finetuning yet.",
    },
    "2": {
      label: "Step 2",
      title: "Diverse rollout generation with perturbations",
      copy:
        "Generate broad simulated data by mixing expert and sub-optimal checkpoints with temporally structured action perturbations. The dataset includes failures and recoveries needed for robust planning.",
      transfer:
        "Simulation diversity broadens coverage so downstream modules remain useful under off-policy planning.",
      adapt:
        "No real-world module updates yet.",
    },
    "3": {
      label: "Step 3",
      title: "Planning-oriented world-model pretraining",
      copy:
        "Pretrain encoder, latent dynamics, reward, value, and base-policy heads jointly from raw observations. Distill reward/value signals and behavior structure into latent prediction.",
      transfer:
        "Encoder, reward, and value modules are prepared for zero-shot transfer.",
      adapt:
        "Dynamics is pretrained here and later finetuned online.",
    },
    "4a": {
      label: "Step 4a",
      title: "Transfer and online planning on real hardware",
      copy:
        "Deploy the pretrained world model in the real world and run sampling-based planning. Frozen reward/value heads provide dense long-horizon guidance immediately.",
      transfer:
        "Encoder + reward + value are transferred and kept frozen.",
      adapt:
        "Dynamics is still being evaluated and will be updated with collected data.",
    },
    "4b": {
      label: "Step 4b",
      title: "Dynamics-only finetuning loop",
      copy:
        "Collect robot trajectories, finetune only the latent dynamics model, and iterate. Adaptation is supervised short-horizon system identification rather than end-to-end RL bootstrapping.",
      transfer:
        "Global task structure from frozen modules remains intact through adaptation.",
      adapt:
        "Only latent dynamics parameters are updated online.",
    },
  };

  const TASK_ORDER = [
    "PEG_NARROW",
    "PEG_WIDE",
    "TABLE_NARROW",
    "TABLE_WIDE",
    "PTFE",
    "FOAM",
  ];

  const TASK_VIDEO_MAP = {
    PEG_NARROW: {
      src: "assets/video/manip_peg_results.mp4",
      caption: "Peg insertion real-world rollouts.",
    },
    PEG_WIDE: {
      src: "assets/video/manip_peg_results.mp4",
      caption: "Peg insertion real-world rollouts.",
    },
    TABLE_NARROW: {
      src: "assets/video/manip_leg_results.mp4",
      caption: "Table-leg assembly real-world rollouts.",
    },
    TABLE_WIDE: {
      src: "assets/video/manip_leg_results.mp4",
      caption: "Table-leg assembly real-world rollouts.",
    },
    PTFE: {
      src: "assets/video/qped_ptfe_results.mp4",
      caption: "Quadruped PTFE slope experiments.",
    },
    FOAM: {
      src: "assets/video/qped_foam_results.mp4",
      caption: "Quadruped foam terrain experiments.",
    },
  };

  const METHOD_COLOR_MAP = {
    "Simulation Distillation": "#0f7f66",
    "Simulation Distillation+BC": "#1f9ad1",
    IQL: "#c95a2a",
    RLPD: "#9b7e12",
    SGFT: "#4f5e78",
    "Diffusion Policy (Real Demos)": "#9f3f2a",
    "Diffusion Polcy (Real + Sim Demos)": "#3e7a40",
    "pi_0.5 (Real Demos)": "#7a4f2a",
    "pi_0.5 (Real + Sim Demos)": "#2f6f8a",
    "Quadruped Success": "#111827",
  };

  const RESULTS_METHOD_PRIORITY = [
    "Simulation Distillation",
    "Simulation Distillation+BC",
    "IQL",
    "RLPD",
    "SGFT",
    "Diffusion Policy (Real Demos)",
    "Diffusion Polcy (Real + Sim Demos)",
    "pi_0.5 (Real Demos)",
    "pi_0.5 (Real + Sim Demos)",
    "Quadruped Success",
  ];

  const resultsState = {
    data: null,
    methods: [],
    hidden: new Set(),
    hovered: null,
    selectedTask: null,
  };

  const valuesState = {
    success: [],
    fail: [],
    minStep: 0,
    maxStep: 0,
    currentStep: 0,
    locked: false,
    chart: null,
  };

  document.addEventListener("DOMContentLoaded", () => {
    initRevealAnimations();
    initSectionSpy();
    initHeroMotion();
    initMethodInteraction();
    initResultsDashboard();
    initValuesTimeline();
  });

  function initRevealAnimations() {
    const nodes = document.querySelectorAll("[data-reveal]");
    if (!nodes.length) {
      return;
    }

    if (REDUCED_MOTION || !("IntersectionObserver" in window)) {
      for (const node of nodes) {
        node.classList.add("is-visible");
      }
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      {
        threshold: 0.2,
      }
    );

    for (const node of nodes) {
      observer.observe(node);
    }
  }

  function initSectionSpy() {
    const navLinks = Array.from(document.querySelectorAll(".site-nav a[data-nav]"));
    if (!navLinks.length || !("IntersectionObserver" in window)) {
      return;
    }

    const idToLink = new Map();
    const sections = [];

    for (const link of navLinks) {
      const id = link.dataset.nav;
      const section = document.getElementById(id);
      if (!section) {
        continue;
      }
      sections.push(section);
      idToLink.set(id, link);
    }

    const setActive = (id) => {
      for (const link of navLinks) {
        if (link.dataset.nav === id) {
          link.setAttribute("aria-current", "true");
        } else {
          link.removeAttribute("aria-current");
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length > 0) {
          setActive(visible[0].target.id);
        }
      },
      {
        threshold: [0.2, 0.45, 0.7],
        rootMargin: "-30% 0px -45% 0px",
      }
    );

    for (const section of sections) {
      observer.observe(section);
    }

    if (sections[0]) {
      setActive(sections[0].id);
    }
  }

  function initHeroMotion() {
    if (REDUCED_MOTION) {
      return;
    }

    const heroVideo = document.querySelector(".hero-video");
    if (!heroVideo) {
      return;
    }

    const onScroll = () => {
      const y = window.scrollY || 0;
      const vh = Math.max(window.innerHeight, 1);
      const p = Math.min(1, y / vh);
      const scale = 1.05 + p * 0.07;
      const shift = p * 26;
      heroVideo.style.transform = "translate3d(0," + shift.toFixed(2) + "px,0) scale(" + scale.toFixed(4) + ")";
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function initMethodInteraction() {
    const hotspots = Array.from(document.querySelectorAll(".hotspot"));
    const controls = Array.from(document.querySelectorAll("[data-step-btn]"));
    const title = document.getElementById("method-step-title");
    const copy = document.getElementById("method-step-copy");
    const transfer = document.getElementById("method-transfer");
    const adapt = document.getElementById("method-adapt");
    const label = document.getElementById("method-step-label");

    if (!hotspots.length || !controls.length || !title || !copy || !transfer || !adapt || !label) {
      return;
    }

    const applyStep = (stepId) => {
      const payload = METHOD_STEPS[stepId];
      if (!payload) {
        return;
      }

      label.textContent = payload.label;
      title.textContent = payload.title;
      copy.textContent = payload.copy;
      transfer.textContent = payload.transfer;
      adapt.textContent = payload.adapt;

      for (const hotspot of hotspots) {
        hotspot.classList.toggle("active", hotspot.dataset.step === stepId);
      }

      for (const control of controls) {
        control.classList.toggle("active", control.dataset.stepBtn === stepId);
      }
    };

    for (const hotspot of hotspots) {
      const step = hotspot.dataset.step;
      const handler = () => applyStep(step);
      hotspot.addEventListener("mouseenter", handler);
      hotspot.addEventListener("focus", handler);
      hotspot.addEventListener("click", handler);
    }

    for (const control of controls) {
      const step = control.dataset.stepBtn;
      const handler = () => applyStep(step);
      control.addEventListener("mouseenter", handler);
      control.addEventListener("focus", handler);
      control.addEventListener("click", handler);
    }

    applyStep("1");
  }

  async function initResultsDashboard() {
    const grid = document.getElementById("results-grid");
    const legendRoot = document.getElementById("results-legend");
    const resetBtn = document.getElementById("legend-reset");

    if (!grid || !legendRoot || !resetBtn) {
      return;
    }

    let payload = null;
    try {
      const response = await fetch("assets/data/results.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load results.json");
      }
      payload = await response.json();
    } catch (error) {
      const notice = document.createElement("p");
      notice.textContent = "Interactive charts could not be loaded. Static fallback remains visible.";
      grid.prepend(notice);
      return;
    }

    resultsState.data = payload;
    resultsState.selectedTask = TASK_ORDER.find((key) => payload[key]) || null;
    resultsState.methods = collectMethodNames(payload);

    buildLegend(legendRoot, resultsState.methods);

    resetBtn.addEventListener("click", () => {
      resultsState.hidden.clear();
      resultsState.hovered = null;
      refreshLegendUI();
      renderResultsCharts();
    });

    renderResultsCharts();
    refreshLegendUI();

    if (resultsState.selectedTask) {
      updateResultsMedia(resultsState.selectedTask);
    }
  }

  function collectMethodNames(data) {
    const names = new Set();

    for (const key of TASK_ORDER) {
      const task = data[key];
      if (!task) {
        continue;
      }
      for (const name of Object.keys(task.data || {})) {
        names.add(name);
      }
      for (const name of Object.keys(task.lines || {})) {
        names.add(name);
      }
    }

    const ordered = [];
    for (const item of RESULTS_METHOD_PRIORITY) {
      if (names.has(item)) {
        ordered.push(item);
        names.delete(item);
      }
    }

    for (const item of names) {
      ordered.push(item);
    }

    return ordered;
  }

  function buildLegend(root, methods) {
    root.innerHTML = "";

    for (const method of methods) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "legend-item";
      button.dataset.method = method;

      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.backgroundColor = colorForMethod(method);

      const label = document.createElement("span");
      label.textContent = method;

      button.appendChild(swatch);
      button.appendChild(label);

      button.addEventListener("mouseenter", () => {
        resultsState.hovered = method;
        refreshLegendUI();
        renderResultsCharts();
      });

      button.addEventListener("mouseleave", () => {
        if (resultsState.hovered === method) {
          resultsState.hovered = null;
          refreshLegendUI();
          renderResultsCharts();
        }
      });

      button.addEventListener("focus", () => {
        resultsState.hovered = method;
        refreshLegendUI();
        renderResultsCharts();
      });

      button.addEventListener("blur", () => {
        if (resultsState.hovered === method) {
          resultsState.hovered = null;
          refreshLegendUI();
          renderResultsCharts();
        }
      });

      button.addEventListener("click", () => {
        if (resultsState.hidden.has(method)) {
          resultsState.hidden.delete(method);
        } else {
          resultsState.hidden.add(method);
        }
        refreshLegendUI();
        renderResultsCharts();
      });

      root.appendChild(button);
    }
  }

  function refreshLegendUI() {
    const legendButtons = document.querySelectorAll(".legend-item");

    for (const button of legendButtons) {
      const method = button.dataset.method;
      button.classList.toggle("hidden", resultsState.hidden.has(method));
      button.classList.toggle("hovered", resultsState.hovered === method);
      button.setAttribute("aria-pressed", resultsState.hidden.has(method) ? "true" : "false");
    }
  }

  function renderResultsCharts() {
    const grid = document.getElementById("results-grid");
    if (!grid || !resultsState.data) {
      return;
    }

    grid.innerHTML = "";

    for (const key of TASK_ORDER) {
      const task = resultsState.data[key];
      if (!task) {
        continue;
      }

      const card = document.createElement("article");
      card.className = "chart-card";
      card.dataset.task = key;
      card.tabIndex = 0;

      const title = document.createElement("h3");
      title.textContent = task.title;

      const wrap = document.createElement("div");
      wrap.className = "chart-wrap";
      wrap.appendChild(buildTaskChartSvg(task));

      const meta = document.createElement("p");
      meta.className = "chart-meta";
      meta.textContent = task.xlabel + " | " + task.ylabel;

      card.appendChild(title);
      card.appendChild(wrap);
      card.appendChild(meta);

      const selectTask = () => {
        resultsState.selectedTask = key;
        markSelectedTaskCard();
        updateResultsMedia(key);
      };

      card.addEventListener("mouseenter", selectTask);
      card.addEventListener("focus", selectTask);
      card.addEventListener("click", selectTask);

      grid.appendChild(card);
    }

    markSelectedTaskCard();
  }

  function markSelectedTaskCard() {
    const cards = document.querySelectorAll(".chart-card");
    for (const card of cards) {
      card.classList.toggle("is-selected", card.dataset.task === resultsState.selectedTask);
    }
  }

  function updateResultsMedia(taskKey) {
    const title = document.getElementById("results-media-title");
    const caption = document.getElementById("results-media-caption");
    const video = document.getElementById("results-media-video");

    if (!title || !caption || !video || !resultsState.data) {
      return;
    }

    const task = resultsState.data[taskKey];
    if (!task) {
      return;
    }

    const mapping = TASK_VIDEO_MAP[taskKey] || TASK_VIDEO_MAP.PEG_NARROW;

    title.textContent = "Task media: " + task.title;
    caption.textContent = mapping.caption + " Hover another chart to swap media.";

    if (video.getAttribute("src") !== mapping.src) {
      video.setAttribute("src", mapping.src);
      video.load();
    }

    safePlay(video);
  }

  function buildTaskChartSvg(task) {
    const width = 560;
    const height = 280;
    const margin = { top: 16, right: 14, bottom: 40, left: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const allDataSeries = Object.entries(task.data || {});
    const allLineSeries = Object.entries(task.lines || {});

    const visibleDataSeries = allDataSeries.filter(([name]) => !resultsState.hidden.has(name));
    const visibleLineSeries = allLineSeries.filter(([name]) => !resultsState.hidden.has(name));

    const xValues = (task.x || []).slice();
    const xMin = Math.min.apply(null, xValues);
    const xMax = Math.max.apply(null, xValues);

    const yValues = [];
    for (const [, values] of visibleDataSeries) {
      for (const value of values) {
        yValues.push(value);
      }
    }
    for (const [, value] of visibleLineSeries) {
      yValues.push(value);
    }

    if (!yValues.length) {
      yValues.push(0, 1);
    }

    let yMin = Math.min.apply(null, yValues);
    let yMax = Math.max.apply(null, yValues);

    if (yMax <= 1.1) {
      yMin = 0;
      yMax = Math.max(1, yMax * 1.08);
    } else {
      yMin = Math.min(0, yMin * 0.95);
      yMax = yMax * 1.05;
    }

    if (Math.abs(yMax - yMin) < 1e-8) {
      yMax = yMin + 1;
    }

    const scaleX = (x) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * plotWidth;
    const scaleY = (y) => margin.top + (1 - (y - yMin) / (yMax - yMin || 1)) * plotHeight;

    const svg = createSvgElement("svg", {
      class: "chart-svg",
      viewBox: "0 0 " + width + " " + height,
      role: "img",
      "aria-label": task.title,
    });

    const plotRect = createSvgElement("rect", {
      x: margin.left,
      y: margin.top,
      width: plotWidth,
      height: plotHeight,
      fill: "#ffffff",
      stroke: "rgba(16, 23, 34, 0.12)",
      "stroke-width": "1",
      rx: "8",
    });
    svg.appendChild(plotRect);

    const yTicks = 5;
    for (let i = 0; i < yTicks; i += 1) {
      const t = i / (yTicks - 1);
      const value = yMin + (1 - t) * (yMax - yMin);
      const y = margin.top + t * plotHeight;

      svg.appendChild(
        createSvgElement("line", {
          x1: margin.left,
          y1: y,
          x2: margin.left + plotWidth,
          y2: y,
          stroke: "rgba(16, 23, 34, 0.13)",
          "stroke-width": i === yTicks - 1 ? "1.1" : "0.8",
        })
      );

      svg.appendChild(
        createSvgElement("text", {
          x: margin.left - 8,
          y: y + 4,
          fill: "#49576a",
          "font-size": "11",
          "text-anchor": "end",
          "font-family": "Sora, sans-serif",
          textContent: formatTick(value),
        })
      );
    }

    const xTickValues = pickXAxisTicks(xValues);
    for (const value of xTickValues) {
      const x = scaleX(value);
      svg.appendChild(
        createSvgElement("line", {
          x1: x,
          y1: margin.top,
          x2: x,
          y2: margin.top + plotHeight,
          stroke: "rgba(16, 23, 34, 0.08)",
          "stroke-width": "0.8",
        })
      );

      svg.appendChild(
        createSvgElement("text", {
          x: x,
          y: margin.top + plotHeight + 18,
          fill: "#49576a",
          "font-size": "11",
          "text-anchor": "middle",
          "font-family": "Sora, sans-serif",
          textContent: String(value),
        })
      );
    }

    for (const [name, yValue] of visibleLineSeries) {
      const y = scaleY(yValue);
      const isHovered = resultsState.hovered === name;
      const isMuted = Boolean(resultsState.hovered && !isHovered);
      const opacity = isMuted ? 0.22 : 0.78;

      svg.appendChild(
        createSvgElement("line", {
          x1: margin.left,
          y1: y,
          x2: margin.left + plotWidth,
          y2: y,
          stroke: colorForMethod(name),
          "stroke-width": isHovered ? "3" : "2",
          "stroke-dasharray": "6 5",
          "stroke-linecap": "round",
          opacity: String(opacity),
        })
      );
    }

    for (const [name, values] of visibleDataSeries) {
      const points = [];
      const len = Math.min(values.length, xValues.length);
      for (let i = 0; i < len; i += 1) {
        points.push([scaleX(xValues[i]), scaleY(values[i])]);
      }

      if (!points.length) {
        continue;
      }

      const isHovered = resultsState.hovered === name;
      const isMuted = Boolean(resultsState.hovered && !isHovered);
      const lineOpacity = isMuted ? 0.22 : 1;
      const strokeWidth = isHovered ? 3.2 : 2.3;

      const d = points
        .map((point, index) => (index === 0 ? "M" : "L") + point[0].toFixed(2) + " " + point[1].toFixed(2))
        .join(" ");

      svg.appendChild(
        createSvgElement("path", {
          d,
          fill: "none",
          stroke: colorForMethod(name),
          "stroke-width": String(strokeWidth),
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
          opacity: String(lineOpacity),
        })
      );

      for (const point of points) {
        svg.appendChild(
          createSvgElement("circle", {
            cx: point[0],
            cy: point[1],
            r: isHovered ? "3" : "2.2",
            fill: "#ffffff",
            stroke: colorForMethod(name),
            "stroke-width": "1.5",
            opacity: String(lineOpacity),
          })
        );
      }
    }

    svg.appendChild(
      createSvgElement("text", {
        x: margin.left + plotWidth / 2,
        y: height - 8,
        fill: "#3a4657",
        "font-size": "11",
        "text-anchor": "middle",
        "font-family": "Sora, sans-serif",
        textContent: task.xlabel,
      })
    );

    svg.appendChild(
      createSvgElement("text", {
        x: 14,
        y: margin.top + plotHeight / 2,
        fill: "#3a4657",
        "font-size": "11",
        "text-anchor": "middle",
        transform: "rotate(-90 14 " + (margin.top + plotHeight / 2) + ")",
        "font-family": "Sora, sans-serif",
        textContent: task.ylabel,
      })
    );

    return svg;
  }

  async function initValuesTimeline() {
    const svg = document.getElementById("values-chart");
    if (!svg) {
      return;
    }

    try {
      const [successText, failText] = await Promise.all([
        fetch("assets/data/values_success.csv", { cache: "no-store" }).then((res) => {
          if (!res.ok) {
            throw new Error("values_success.csv load failed");
          }
          return res.text();
        }),
        fetch("assets/data/values_fail.csv", { cache: "no-store" }).then((res) => {
          if (!res.ok) {
            throw new Error("values_fail.csv load failed");
          }
          return res.text();
        }),
      ]);

      valuesState.success = parseValueCsv(successText);
      valuesState.fail = parseValueCsv(failText);

      if (!valuesState.success.length || !valuesState.fail.length) {
        throw new Error("value CSV files are empty");
      }

      const min = Math.min(valuesState.success[0].step, valuesState.fail[0].step);
      const max = Math.max(
        valuesState.success[valuesState.success.length - 1].step,
        valuesState.fail[valuesState.fail.length - 1].step
      );

      valuesState.minStep = min;
      valuesState.maxStep = max;
      valuesState.currentStep = min;

      buildValuesChart();
      bindValuesLockToggle();
    } catch (error) {
      const status = document.getElementById("values-status");
      if (status) {
        status.textContent = "Value timeline could not be loaded.";
      }
    }
  }

  function parseValueCsv(text) {
    const rows = text.trim().split(/\r?\n/);
    const points = [];

    for (const row of rows) {
      const parts = row.split(",");
      if (parts.length < 2) {
        continue;
      }

      const step = Number(parts[0]);
      const value = Number(parts[1]);
      if (Number.isFinite(step) && Number.isFinite(value)) {
        points.push({ step, value });
      }
    }

    return points;
  }

  function buildValuesChart() {
    const svg = document.getElementById("values-chart");
    if (!svg) {
      return;
    }

    const width = 900;
    const height = 360;
    const margin = { top: 18, right: 12, bottom: 42, left: 50 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const success = valuesState.success;
    const fail = valuesState.fail;

    const allValues = success.map((point) => point.value).concat(fail.map((point) => point.value));
    let yMin = Math.min.apply(null, allValues);
    let yMax = Math.max.apply(null, allValues);
    const pad = (yMax - yMin || 1) * 0.08;
    yMin -= pad;
    yMax += pad;

    const xMin = valuesState.minStep;
    const xMax = valuesState.maxStep;

    const scaleX = (x) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * plotWidth;
    const scaleY = (y) => margin.top + (1 - (y - yMin) / (yMax - yMin || 1)) * plotHeight;

    svg.innerHTML = "";

    svg.appendChild(
      createSvgElement("rect", {
        x: margin.left,
        y: margin.top,
        width: plotWidth,
        height: plotHeight,
        fill: "#ffffff",
        stroke: "rgba(16, 23, 34, 0.16)",
        "stroke-width": "1",
        rx: "8",
      })
    );

    const yTicks = 5;
    for (let i = 0; i < yTicks; i += 1) {
      const t = i / (yTicks - 1);
      const y = margin.top + t * plotHeight;
      const value = yMin + (1 - t) * (yMax - yMin);

      svg.appendChild(
        createSvgElement("line", {
          x1: margin.left,
          y1: y,
          x2: margin.left + plotWidth,
          y2: y,
          stroke: "rgba(16, 23, 34, 0.12)",
          "stroke-width": "0.8",
        })
      );

      svg.appendChild(
        createSvgElement("text", {
          x: margin.left - 8,
          y: y + 4,
          fill: "#49576a",
          "font-size": "11",
          "text-anchor": "end",
          "font-family": "Sora, sans-serif",
          textContent: formatTick(value),
        })
      );
    }

    const xTickCount = 6;
    for (let i = 0; i < xTickCount; i += 1) {
      const t = i / (xTickCount - 1);
      const step = Math.round(xMin + t * (xMax - xMin));
      const x = scaleX(step);

      svg.appendChild(
        createSvgElement("line", {
          x1: x,
          y1: margin.top,
          x2: x,
          y2: margin.top + plotHeight,
          stroke: "rgba(16, 23, 34, 0.08)",
          "stroke-width": "0.8",
        })
      );

      svg.appendChild(
        createSvgElement("text", {
          x,
          y: margin.top + plotHeight + 18,
          fill: "#49576a",
          "font-size": "11",
          "text-anchor": "middle",
          "font-family": "Sora, sans-serif",
          textContent: String(step),
        })
      );
    }

    svg.appendChild(
      createSvgElement("path", {
        d: toPath(success, scaleX, scaleY),
        fill: "none",
        stroke: "#0f7f66",
        "stroke-width": "2.6",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      })
    );

    svg.appendChild(
      createSvgElement("path", {
        d: toPath(fail, scaleX, scaleY),
        fill: "none",
        stroke: "#c95a2a",
        "stroke-width": "2.6",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      })
    );

    svg.appendChild(
      createSvgElement("text", {
        x: margin.left + 6,
        y: margin.top + 14,
        fill: "#0f7f66",
        "font-size": "12",
        "font-family": "Sora, sans-serif",
        textContent: "Success",
      })
    );

    svg.appendChild(
      createSvgElement("text", {
        x: margin.left + 78,
        y: margin.top + 14,
        fill: "#c95a2a",
        "font-size": "12",
        "font-family": "Sora, sans-serif",
        textContent: "Failure",
      })
    );

    const cursorLine = createSvgElement("line", {
      x1: scaleX(valuesState.minStep),
      y1: margin.top,
      x2: scaleX(valuesState.minStep),
      y2: margin.top + plotHeight,
      stroke: "#0b9ab6",
      "stroke-width": "1.4",
      "stroke-dasharray": "5 4",
    });

    const successDot = createSvgElement("circle", {
      cx: scaleX(valuesState.minStep),
      cy: scaleY(success[0].value),
      r: "4",
      fill: "#ffffff",
      stroke: "#0f7f66",
      "stroke-width": "2",
    });

    const failDot = createSvgElement("circle", {
      cx: scaleX(valuesState.minStep),
      cy: scaleY(fail[0].value),
      r: "4",
      fill: "#ffffff",
      stroke: "#c95a2a",
      "stroke-width": "2",
    });

    svg.appendChild(cursorLine);
    svg.appendChild(successDot);
    svg.appendChild(failDot);

    svg.appendChild(
      createSvgElement("text", {
        x: margin.left + plotWidth / 2,
        y: height - 8,
        fill: "#3a4657",
        "font-size": "11",
        "font-family": "Sora, sans-serif",
        "text-anchor": "middle",
        textContent: "Step index",
      })
    );

    svg.appendChild(
      createSvgElement("text", {
        x: 14,
        y: margin.top + plotHeight / 2,
        fill: "#3a4657",
        "font-size": "11",
        "font-family": "Sora, sans-serif",
        "text-anchor": "middle",
        transform: "rotate(-90 14 " + (margin.top + plotHeight / 2) + ")",
        textContent: "Predicted value",
      })
    );

    const eventRect = createSvgElement("rect", {
      x: margin.left,
      y: margin.top,
      width: plotWidth,
      height: plotHeight,
      fill: "transparent",
      cursor: "crosshair",
    });

    eventRect.addEventListener("mousemove", (event) => {
      if (valuesState.locked) {
        return;
      }
      const step = stepFromEvent(event, svg, margin.left, plotWidth, xMin, xMax);
      setValuesStep(step, {
        cursorLine,
        successDot,
        failDot,
        scaleX,
        scaleY,
      });
    });

    eventRect.addEventListener("click", (event) => {
      const step = stepFromEvent(event, svg, margin.left, plotWidth, xMin, xMax);
      setValuesStep(step, {
        cursorLine,
        successDot,
        failDot,
        scaleX,
        scaleY,
      });
    });

    svg.appendChild(eventRect);

    valuesState.chart = {
      cursorLine,
      successDot,
      failDot,
      scaleX,
      scaleY,
    };

    setValuesStep(valuesState.currentStep, valuesState.chart);
  }

  function bindValuesLockToggle() {
    const lockButton = document.getElementById("values-lock");
    const status = document.getElementById("values-status");
    const successVideo = document.getElementById("values-video-success");
    const failVideo = document.getElementById("values-video-fail");

    if (!lockButton || !status || !successVideo || !failVideo) {
      return;
    }

    lockButton.addEventListener("click", () => {
      valuesState.locked = !valuesState.locked;
      lockButton.setAttribute("aria-pressed", valuesState.locked ? "true" : "false");

      if (valuesState.locked) {
        lockButton.textContent = "Unlock Frame";
        status.textContent = "Frame locked";
        successVideo.pause();
        failVideo.pause();
      } else {
        lockButton.textContent = "Lock Frame";
        status.textContent = "Scrub mode active";
        safePlay(successVideo);
        safePlay(failVideo);
        if (valuesState.chart) {
          setValuesStep(valuesState.currentStep, valuesState.chart);
        }
      }
    });
  }

  function setValuesStep(step, chartRefs) {
    const successSeries = valuesState.success;
    const failSeries = valuesState.fail;
    if (!successSeries.length || !failSeries.length) {
      return;
    }

    const clamped = Math.max(valuesState.minStep, Math.min(valuesState.maxStep, Math.round(step)));
    valuesState.currentStep = clamped;

    const successPoint = pointAtStep(successSeries, clamped);
    const failPoint = pointAtStep(failSeries, clamped);

    if (chartRefs) {
      const x = chartRefs.scaleX(clamped);
      chartRefs.cursorLine.setAttribute("x1", x);
      chartRefs.cursorLine.setAttribute("x2", x);
      chartRefs.successDot.setAttribute("cx", x);
      chartRefs.successDot.setAttribute("cy", chartRefs.scaleY(successPoint.value));
      chartRefs.failDot.setAttribute("cx", x);
      chartRefs.failDot.setAttribute("cy", chartRefs.scaleY(failPoint.value));
    }

    updateValuesReadout(clamped, successPoint.value, failPoint.value);

    if (!valuesState.locked) {
      const ratio = (clamped - valuesState.minStep) / (valuesState.maxStep - valuesState.minStep || 1);
      const successVideo = document.getElementById("values-video-success");
      const failVideo = document.getElementById("values-video-fail");
      syncVideoToRatio(successVideo, ratio);
      syncVideoToRatio(failVideo, ratio);
    }
  }

  function updateValuesReadout(step, successValue, failValue) {
    const stepNode = document.getElementById("values-step");
    const successNode = document.getElementById("values-success");
    const failNode = document.getElementById("values-fail");
    const successTimeNode = document.getElementById("values-success-time");
    const failTimeNode = document.getElementById("values-fail-time");

    if (stepNode) {
      stepNode.textContent = String(step);
    }

    if (successNode) {
      successNode.textContent = Number(successValue).toFixed(3);
    }

    if (failNode) {
      failNode.textContent = Number(failValue).toFixed(3);
    }

    const successVideo = document.getElementById("values-video-success");
    const failVideo = document.getElementById("values-video-fail");

    if (successTimeNode) {
      successTimeNode.textContent = formatVideoTime(successVideo);
    }

    if (failTimeNode) {
      failTimeNode.textContent = formatVideoTime(failVideo);
    }
  }

  function stepFromEvent(event, svg, xOrigin, plotWidth, minStep, maxStep) {
    const rect = svg.getBoundingClientRect();
    const xPx = event.clientX - rect.left;
    const normalized = Math.max(0, Math.min(1, (xPx - (xOrigin / 900) * rect.width) / ((plotWidth / 900) * rect.width)));
    return minStep + normalized * (maxStep - minStep);
  }

  function pointAtStep(series, step) {
    let nearest = series[0];
    let bestDist = Math.abs(nearest.step - step);

    for (let i = 1; i < series.length; i += 1) {
      const point = series[i];
      const dist = Math.abs(point.step - step);
      if (dist < bestDist) {
        nearest = point;
        bestDist = dist;
      }
    }

    return nearest;
  }

  function syncVideoToRatio(video, ratio) {
    if (!video) {
      return;
    }

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }

    const target = ratio * video.duration;
    if (Math.abs(video.currentTime - target) > 0.08) {
      try {
        video.currentTime = target;
      } catch (error) {
        return;
      }
    }
  }

  function formatVideoTime(video) {
    if (!video || !Number.isFinite(video.currentTime)) {
      return "-";
    }

    const totalSeconds = Math.max(0, Math.floor(video.currentTime));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes) + ":" + String(seconds).padStart(2, "0");
  }

  function pickXAxisTicks(values) {
    if (!values.length) {
      return [0];
    }

    if (values.length <= 4) {
      return values;
    }

    const picks = [values[0]];
    const mid = values[Math.floor((values.length - 1) / 2)];
    picks.push(mid);
    const quarter = values[Math.floor((values.length - 1) / 4)];
    const threeQuarter = values[Math.floor(((values.length - 1) * 3) / 4)];
    picks.push(quarter, threeQuarter);
    picks.push(values[values.length - 1]);

    return Array.from(new Set(picks)).sort((a, b) => a - b);
  }

  function toPath(points, scaleX, scaleY) {
    return points
      .map((point, idx) => {
        const x = scaleX(point.step);
        const y = scaleY(point.value);
        return (idx === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
      })
      .join(" ");
  }

  function colorForMethod(methodName) {
    if (METHOD_COLOR_MAP[methodName]) {
      return METHOD_COLOR_MAP[methodName];
    }

    let hash = 0;
    for (let i = 0; i < methodName.length; i += 1) {
      hash = (hash << 5) - hash + methodName.charCodeAt(i);
      hash |= 0;
    }

    const hue = Math.abs(hash) % 360;
    return "hsl(" + hue + " 58% 42%)";
  }

  function formatTick(value) {
    if (Math.abs(value) >= 10) {
      return value.toFixed(1);
    }

    if (Math.abs(value) >= 1) {
      return value.toFixed(2);
    }

    return value.toFixed(2);
  }

  function createSvgElement(name, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "textContent") {
        node.textContent = value;
      } else {
        node.setAttribute(key, String(value));
      }
    }
    return node;
  }

  function safePlay(video) {
    if (!video) {
      return;
    }

    video.muted = true;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }
})();
