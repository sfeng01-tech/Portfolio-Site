export const portfolioData = {
  profile: {
    name: "Sahil Faizal",
    title: "Software Engineer",
    tagline: "Building scalable AI systems for training and inference",
    email: "sahilfaiz2025@gmail.com",
    linkedin: "https://linkedin.com/in/sahil-faizal",
    github: "https://github.com/sahilfaizal01",
    twitter: "https://x.com/sahilfaiz074",
  },

  skills: [
    {
      category: "Programming Languages",
      items: [
        "Python",
        "C++",
        "SQL",
        "Java",
        "R",
      ],
    },
    {
      category: "Deep Learning Frameworks",
      items: [
        "PyTorch",
        "TensorFlow",
        "JAX",
        "MLX",
      ],
    },
    {
      category: "LLM & AI Systems",
      items: [
        "LLM Inference",
        "RAG",
        "Pre-Training",
        "Post-Training",
        "Reinforcement Learning",
        "Harness Engineering",
        "Context Engineering",
        "Evaluation & Benchmarking",
      ],
    },
    {
      category: "Agentic AI Frameworks",
      items: [
        "LangChain",
        "LangGraph",
        "CrewAI",
        "PydanticAI",
        "AutoGen",
        "A2A",
        "MCP",
      ],
    },
    {
      category: "Performance Engineering",
      items: [
        "CUDA",
        "HIP",
        "Triton",
        "MLIR",
        "GPU Kernel Optimization",
        "Quantization",
        "Speculative Decoding",
        "Dynamic Batching",
        "KV Caching",
        "Chunked Prefill",
        "FlashAttention",
        "PagedAttention",
        "Parallelism Strategies",
        "Profiling",
      ],
    },
    {
      category: "Software Engineering",
      items: [
        "CMake",
        "Bash Scripting",
        "Git & GitHub",
        "Concurrent Programming",
        "Distributed Systems",
        "Cloud Computing",
        "System Design",
      ],
    },
    {
      category: "AI Infrastructure",
      items: [
        "Kubernetes",
        "Docker",
        "vLLM/SGLang",
        "Ray",
        "MLflow",
        "GitHub Actions",
        "Grafana + Prometheus",
        "Kubeflow",
        "DVC",
        "AWS",
      ],
    },
  ],

  achievements: [
    "CVP Spotlight Award, Q3 2026 — For contributions towards ROCm software bringup on the latest Instinct accelerators.",
    "Owned end-to-end development of 8 critical LLM optimization features in 10 weeks, reducing model execution time by 60%",
    "Defined and streamlined the technical execution plan to deliver a custom LLM serving backend in a 3× shorter timeline",
    "Contributed to MLPerf Inference v5.0 submission for SDXL, achieving 97% of the target performance.",
    "AMD Spotlight Award — For contributions to the open-source developer ecosystem and efforts in enabling developers to build and optimize solutions on AMD hardware.",
    "Published 6+ papers in reputed AI journals and conferences",
    "Recipient of the Graduate Scholarship – New York University, USA",
    "Excellence Award – Samsung R&D Institute, India",
    "MITACS Globalink Research Award – Dalhousie University, Canada",
  ],

  experiences: [
    {
      company: "Advanced Micro Devices (AMD)",
      position: "Software Engineer - AI Platforms",
      location: "San Jose, CA",
      startDate: "2025-06",
      endDate: "Present",
      description:
        "Architected and optimized production LLM/VLM inference systems on AMD GPUs, improving performance, reliability, and deployment readiness for large-scale AI workloads.",
      highlights: [
        "Architected and optimized production LLM/VLM inference systems on AMD GPUs, profiling kernels, eliminating performance bottlenecks, and coordinating across 4+ engineering teams to deliver scalable deployments and achieve MLPerf performance targets.",
        "Enabled Triton Inference Server support for custom Python backends on AMD GPUs and deployed representative transformer models with dynamic batching, accelerating end-to-end inference benchmarking and production validation.",
        "Built a Fleet Intelligence Agent serving 100+ engineers by analyzing telemetry from 10K+ GPU servers using scalable LLM-powered inference services, leading an intern through implementation and rollout.",
        "Productionized an LLM-powered ROCm Pull Request Review Agent with multi-stage filtering, retrieval, and safety guardrails, reducing software regressions by 47% within the first month.",
        "Debugged and resolved a critical Linux kernel and ROCm driver synchronization issue impacting GPU execution, restoring stability for large-scale AI workloads in under two weeks.",
        "Enhanced ROCm Compute Sanitizer integration with automated CI health gates to detect memory violations, race conditions, and correctness regressions before release.",
        "Developed an AI-powered security scanning framework for ROCm and audited GitHub repositories to identify vulnerabilities across open-source AI software dependencies.",
        "Validated ROCm software across 16 GPU/APU platforms and multiple operating systems, expanding automated test coverage and enabling reliable nightly qualification pipelines.",
      ],
    },
    {
      company: "Advanced Micro Devices (AMD)",
      position: "Software Engineer Intern - AI Infrastructure",
      location: "Santa Clara, CA",
      startDate: "2025-01",
      endDate: "2025-05",
      description:
        "Built inference validation, benchmarking, and capacity planning infrastructure for AMD’s SHARK-AI and ML CI/CD workloads to improve release reliability and scalability.",
      highlights: [
        "Built automated inference validation and benchmarking pipelines for SDXL, Llama, and Flux on AMD GPUs using SHARK-AI, detecting performance regressions and improving release reliability to achieve 95–97% of target performance for MLPerf Inference v5.0 and v5.1.",
        "Enhanced ML infrastructure scalability and efficiency by developing a real-time capacity planning dashboard with hourly updates, enabling 10x growth for AI workloads.",
        "Prepared release documentation, facilitated cross-functional collaboration, and delivered executive updates to communicate project status, risks, and wins.",
        "Identified and resolved infrastructure and execution bottlenecks, improving project velocity.",
      ],
    },
    {
      company: "New York University (NYU)",
      position: "Data Analyst",
      location: "New York, NY",
      startDate: "2024-01",
      endDate: "2025-05",
      description:
        "Engineered ETL pipelines, performed data analytics, and automation solutions to deliver actionable insights and AI-powered solutions for operational use.",
      highlights: [
        "Reduced data delivery time via optimized ETL pipelines and automated ingestion.",
        "Delivered actionable insights from large datasets, generating savings through predictive analysis.",
        "Built a text document processing software to retrieve and rank information from a database, improving information access and query efficiency.",
      ],
    },

    {
      company: "New York University (NYU)",
      position: "DevOps Intern",
      location: "New York, NY",
      startDate: "2024-09",
      endDate: "2024-12",
      description:
        "Built Kubernetes-native security and observability tools to strengthen platform security, monitor vulnerabilities, and provide actionable dashboards for HPC clusters.",
      highlights: [
        "Developed a dashboard identifying 5000+ weak passwords, improving HPC cluster security.",
        "Engineered a continuous security scanning solution detecting critical container vulnerabilities.",
        "Integrated Kubernetes API tools with Grafana/Prometheus to enhance platform observability and user adoption.",
      ],
    },

    {
      company: "Johnson & Johnson (J&J)",
      position: "Computer Vision Intern",
      location: "Redwood City, CA",
      startDate: "2024-05",
      endDate: "2024-08",
      description:
        "Designed and deployed a real-time segmentation algorithm and scalable MLOps pipelines for surgical video analysis to improve surgical outcomes.",

      highlights: [
        "Developed segmentation algorithms to accurately localize surgical targets while reducing false positives.",
        "Implemented MLOps pipelines for efficient experiment tracking, model retraining, and distributed inference on large-scale surgical video datasets.",
        "Conducted comparative performance analysis by fine-tuning vision foundation models, identifying the best architectures for surgical video understanding.",
        "Designed custom performance metrics and modules to quantify and enhance model robustness, supporting faster and safer surgical analysis.",
      ],
    },

    {
      company: "NYU Langone Health",
      position: "Research Associate",
      location: "New York, NY",
      startDate: "2023-06",
      endDate: "2024-05",
      description:
        "Developed AI-powered scene-specific semantic segmentation models to assist persons with blindness or low vision (pBLV), improving object localization, low-light resilience, and daily navigation independence.",
      highlights: [
        "Built scene-specific segmentation models for indoor spaces, outperforming generic models in object identification and resilience to low-light conditions.",
        "Collected, processed, and analyzed large-scale image datasets, fine-tuning deep learning architectures to optimize real-world assistive performance.",
        "Contributed to a paper demonstrating enhanced semantic segmentation, improving functional independence and supporting mobile deployment strategies.",
      ],
    },

    {
      company: "Nanyang Technological University (NTU)",
      position: "Research Engineer Intern",
      location: "Remote",
      startDate: "2022-08",
      endDate: "2023-08",
      description:
        "Built AI-driven GUI software integrating deep learning for classroom emotion analysis, enabling educators to extract actionable insights from video data.",
      highlights: [
        "Delivered a 75% improvement in actionable insights with PyQt5-based GUI for academic emotion analytics.",
        "Achieved 80% landmark tracking success with CNN-based facial recognition for 35% faster analysis.",
        "Improved academic emotion detection accuracy by 60% through multi-feature analytics integration.",
      ],
    },

    {
      company: "MITACS",
      position: "Globalink Research Intern",
      location: "Nova Scotia, Canada",
      startDate: "2022-05",
      endDate: "2022-08",
      description:
        "Developed computer vision systems for automated agricultural analysis, deploying deep learning solutions on embedded platforms for high-throughput sorting and anomaly detection.",
      highlights: [
        "Built a potato sorting system with 90% size estimation precision under challenging conditions.",
        "Deployed deep learning on embedded systems achieving 30 FPS processing and 93% anomaly detection precision.",
        "Conducted cluster analysis achieving 0.9 ARI for reliable tuber dimension classification.",
      ],
    },

    {
      company: "Samsung R&D Institute",
      position: "PRISM R&D Intern",
      location: "Bangalore, India",
      startDate: "2021-11",
      endDate: "2022-08",
      description:
        "Created full-stack AI applications combining NLP and generative models for music composition and video context synthesis, optimizing user experience on cloud platforms.",
      highlights: [
        "Fine-tuned NLP models for music composition with 50ms inference time, enabling real-time generation.",
        "Built a full-stack web application for context-aware music-video synthesis, reducing load time by 25%.",
        "Integrated conditional generative models with LSTM-based video classifiers to enhance content personalization.",
      ],
    },
  ],

  projects: [
    {
      title: "Orchard Inference",
      date: "2026-07",
      description:
        "Machine learning inference project focused on building and evaluating efficient model inference workflows.",
      technologies: ["Python", "Machine Learning", "Model Inference", "Apple"],
      github: "https://github.com/sfeng01-tech/Orchard-Inference/tree/main",
      highlights: [
        "Developed an inference-focused machine learning workflow.",
        "Explored practical techniques for running models efficiently.",
        "Organized the project for reproducible experimentation and evaluation.",
      ],
    },
    {
      title: "KernelHub",
      date: "2026-07",
      description:
        "Apple-focused systems project exploring high-performance GPU kernels and machine learning workloads.",
      technologies: ["Apple", "GPU Kernels", "Machine Learning", "Performance Engineering"],
      github: "https://github.com/sfeng01-tech/KernelHub",
      highlights: [
        "Explored GPU kernel implementations for Apple hardware.",
        "Focused on efficient execution of machine learning workloads.",
        "Investigated performance optimization techniques for modern AI systems.",
      ],
    },
    {
      title: "tLM: A Tiny LLM from Scratch",
      date: "2025-03",
      description:
        "LLM implementation project for building a compact language model from first principles.",
      technologies: ["Python", "PyTorch", "Transformers", "LLMs"],
      github: "https://github.com/sfeng01-tech/tLM---A-tiny-LLM-from-Scratch",
      highlights: [
        "Implemented core transformer language-modeling components from scratch.",
        "Built training and inference flows for a compact LLM.",
        "Explored tokenizer, architecture, and generation fundamentals.",
      ],
    },
    {
      title: "RagHub",
      date: "2025-03",
      description:
        "Retrieval-augmented generation project for building document-grounded LLM applications.",
      technologies: ["Python", "RAG", "LLMs", "Vector Search"],
      github: "https://github.com/sfeng01-tech/RagHub",
      highlights: [
        "Built retrieval workflows for grounding LLM responses in external documents.",
        "Integrated embedding, indexing, and generation components into an AI system.",
        "Explored prompt and context design for reliable answer generation.",
      ],
    },
    {
      title: "Episodic Transformer Memory PPO Evaluation",
      date: "2024-12",
      description:
        "Research-style reinforcement learning project comparing Episodic Transformer Memory PPO against traditional Transformer PPO.",
      technologies: ["Python", "Reinforcement Learning", "PPO", "Transformers"],
      github:
        "https://github.com/sfeng01-tech/Evaluating-the-Performance-of-Episodic-Transformer-Memory-PPO-vs.-Traditional-Transformer-PPO",
      highlights: [
        "Compared memory-augmented transformer policies with baseline PPO approaches.",
        "Designed experiments to evaluate policy performance and learning stability.",
        "Analyzed tradeoffs between episodic memory and traditional transformer-based RL.",
      ],
    },
    {
      title: "Large-Scale Vector DB",
      date: "2024-12",
      description:
        "Vector database project exploring scalable similarity search and embedding-backed retrieval.",
      technologies: ["Python", "Vector Databases", "Embeddings", "Search"],
      github: "https://github.com/sfeng01-tech/Large-Scale-Vector-DB",
      highlights: [
        "Implemented vector storage and similarity search workflows.",
        "Evaluated retrieval behavior over embedding-indexed datasets.",
        "Explored infrastructure patterns for scalable AI retrieval systems.",
      ],
    },
    {
      title: "Fine-Tuning Llama 3.1 LLM",
      date: "2024-11",
      description:
        "Kaggle competition project for adapting Llama 3.1 through fine-tuning and task-specific evaluation.",
      technologies: ["Python", "Llama 3.1", "PyTorch", "Fine-Tuning"],
      github:
        "https://github.com/sfeng01-tech/Kaggle-Contest---Fine-tuning-Llama-3.1-LLM-",
      highlights: [
        "Prepared model fine-tuning workflows for competition-style datasets.",
        "Evaluated model behavior across task-specific prompts and outputs.",
        "Experimented with LLM adaptation techniques and training configurations.",
      ],
    },
    {
      title: "Sales and Customer Analytics Engine",
      date: "2024-08",
      description:
        "Analytics engine for customer segmentation, sales intelligence, and business reporting.",
      technologies: ["Python", "SQL", "Analytics", "Machine Learning"],
      github:
        "https://github.com/sfeng01-tech/Sales-and-Customer-Analytics-Engine",
      highlights: [
        "Built analytical workflows for sales and customer behavior data.",
        "Generated metrics and insights for business decision-making.",
        "Designed reusable data processing components for reporting.",
      ],
    },
    {
      title: "Shark Tank",
      date: "2024-04",
      description:
        "AI virtual VC platform that helps founders get structured fundraising, product, and go-to-market advice.",
      technologies: ["MongoDB", "AI", "JavaScript", "Full-Stack"],
      github: "https://github.com/sugamxp/mongodb-hack",
      highlights: [
        "Built an AI-guided advisory experience for startup founders.",
        "Used MongoDB-backed workflows to store founder context and application state.",
        "Designed product flows for personalized venture-style feedback.",
      ],
    },
    {
      title: "Smooth - Task Management Software",
      date: "2023-09",
      description:
        "Interactive application built to streamline curriculum planning at NYU.",
      technologies: ["Python", "Django", "JavaScript", "Web Development"],
      github:
        "https://github.com/gcivil-nyu-org/INET-Monday-Fall2023-Team-3",
      highlights: [
        "Built a smoother planning workflow for students navigating courses and requirements.",
        "Implemented backend features, frontend interfaces, and integration logic.",
        "Collaborated in a team environment using version control and iterative delivery.",
      ],
    },
    {
      title: "KeralaEats ChatBot",
      date: "2023-09",
      description:
        "Conversational chatbot project for food discovery and restaurant-style user interactions.",
      technologies: ["Python", "Chatbot", "NLP", "Conversational AI"],
      github: "https://github.com/sfeng01-tech/KeralaEats-ChatBot",
      highlights: [
        "Built conversational flows for food-related recommendations and queries.",
        "Applied NLP techniques to improve user interaction quality.",
        "Structured chatbot responses around domain-specific user intents.",
      ],
    },
    {
      title: "Multi-Vehicle Tracking, Counting, and Velocity Calculation",
      date: "2023-05",
      description:
        "Computer vision project for detecting, tracking, counting, and estimating vehicle velocity from video.",
      technologies: ["Python", "Computer Vision", "Object Tracking", "OpenCV"],
      github:
        "https://github.com/sfeng01-tech/Multi-Vehicle-Tracking-Counting-and-Velocity-Calculation",
      highlights: [
        "Implemented video-based vehicle detection and tracking workflows.",
        "Calculated vehicle counts and estimated motion-based velocity.",
        "Applied computer vision techniques to traffic analytics use cases.",
      ],
    },
  ],

  openSourceContributions: {
    profile: "https://github.com/sa-faizal",
    summary:
      "Selected merged work across GPU runtimes, LLM inference, concurrency, and sanitizer tooling, alongside release engineering for the IREE ecosystem.",
    releaseWork: [
      {
        version: "v3.7",
        date: "July–September 2025",
        releases: [
          {
            repository: "IREE",
            releaseUrl: "https://github.com/iree-org/iree/tree/v3.7.0",
            releaseLabel: "Release tag",
            bumpUrl: "https://github.com/iree-org/iree/pull/21460",
          },
          {
            repository: "IREE Turbine",
            releaseUrl: "https://github.com/iree-org/iree-turbine/releases/tag/v3.7.0",
            bumpUrl: "https://github.com/iree-org/iree-turbine/pull/1088",
          },
          {
            repository: "Wave",
            releaseUrl: "https://github.com/iree-org/wave/releases/tag/v3.7.0",
          },
          {
            repository: "SHARK-AI",
            releaseUrl: "https://github.com/nod-ai/amd-shark-ai/releases/tag/v3.7.0",
            bumpUrl: "https://github.com/nod-ai/amd-shark-ai/pull/1895",
          },
        ],
      },
      {
        version: "v3.8",
        date: "September–October 2025",
        releases: [
          {
            repository: "IREE",
            releaseUrl: "https://github.com/iree-org/iree/tree/v3.8.0",
            releaseLabel: "Release tag",
            bumpUrl: "https://github.com/iree-org/iree/pull/21852",
          },
          {
            repository: "IREE Turbine",
            releaseUrl: "https://github.com/iree-org/iree-turbine/releases/tag/v3.8.0",
            bumpUrl: "https://github.com/iree-org/iree-turbine/pull/1138",
          },
          {
            repository: "Wave",
            releaseUrl: "https://github.com/iree-org/wave/releases/tag/v3.8.0",
            bumpUrl: "https://github.com/iree-org/wave/pull/362",
          },
          {
            repository: "SHARK-AI",
            releaseUrl: "https://github.com/nod-ai/amd-shark-ai/releases/tag/v3.8.0",
            bumpUrl: "https://github.com/nod-ai/amd-shark-ai/pull/2183",
          },
        ],
      },
      {
        version: "v3.9",
        date: "October–December 2025",
        releases: [
          {
            repository: "IREE",
            releaseUrl: "https://github.com/iree-org/iree/tree/v3.9.0",
            releaseLabel: "Release tag",
            bumpUrl: "https://github.com/iree-org/iree/pull/22308",
          },
          {
            repository: "IREE Turbine",
            releaseUrl: "https://github.com/iree-org/iree-turbine/releases/tag/v3.9.0",
            bumpUrl: "https://github.com/iree-org/iree-turbine/pull/1177",
          },
          {
            repository: "Wave",
            releaseUrl: "https://github.com/iree-org/wave/releases/tag/v3.9",
            bumpUrl: "https://github.com/iree-org/wave/pull/481",
          },
          {
            repository: "SHARK-AI",
            releaseUrl: "https://github.com/nod-ai/amd-shark-ai/releases/tag/v3.9.0",
            bumpUrl: "https://github.com/nod-ai/amd-shark-ai/pull/2509",
          },
        ],
      },
    ],
    contributions: [
      {
        repository: "ROCm/hrx-system",
        title: "Load GPU code objects with multiple metadata notes",
        date: "2026-10-05",
        url: "https://github.com/ROCm/hrx-system/pull/1232",
        description:
          "Fixed the HSACO loader to combine kernel metadata from every AMDGPU note, allowing a previously failing 80-kernel hipBLASLt code object to load. Preserved kernel argument reflection and added regression coverage; validated FP32 and FP16 GEMMs against a CPU reference.",
        changes: "GPU runtime · Metadata parsing",
      },
      {
        repository: "turboderp-org/exllamav3",
        title: "Unblock LLM inference with pip-installed ROCm SDKs",
        date: "2026-10-06",
        url: "https://github.com/turboderp-org/exllamav3/pull/451",
        description:
          "Fixed ROCm SDK initialization and header discovery so ExLlamaV3's JIT extension can build with pip-installed SDK 10.0. Validated on Radeon 8060S with 503 passing GPU tests and Llama 3.2 1B / Qwen3 8B inference checks at prompt lengths up to 16K tokens.",
        changes: "LLM inference · ROCm compatibility",
      },
      {
        repository: "ROCm/rocm-systems",
        title: "Simplify hipFile task ownership and test concurrency",
        date: "2026-10-02",
        url: "https://github.com/ROCm/rocm-systems/pull/12320",
        description:
          "Simplified task-state ownership and completion notification in hipFile's thread pool, removing a global publication mutex. Added four regression tests for publication, cancellation, destruction, and concurrent submitters; validated all 700 host unit tests with verified ThreadSanitizer instrumentation.",
        changes: "Concurrency · Thread-pool lifecycle",
      },
      {
        repository: "ROCm/rocm-systems",
        title: "Fix a profiler shutdown callback race",
        date: "2026-10-01",
        url: "https://github.com/ROCm/rocm-systems/pull/11739",
        description:
          "Fixed a locally reproduced ThreadSanitizer race in rocprofiler-systems' flush worker by avoiding the stop-token callback lifetime path while preserving its timed wait. Extended regression coverage for repeated and immediate stop requests without disabling tests or adding sanitizer suppressions.",
        changes: "GPU profiling · Thread safety",
      },
      {
        repository: "ROCm/TheRock",
        title: "Repair AddressSanitizer runtime discovery",
        date: "2026-10-08",
        url: "https://github.com/ROCm/TheRock/pull/8721",
        description:
          "Fixed sanitizer startup failures by exporting the runtime library directory and supporting both current and legacy ASan filenames. Resolved missing dependencies in rocPRIM, hipCUB, and rocThrust resource helpers on MI325 hardware, with configuration and dashboard checks passing on Linux and Windows.",
        changes: "Build tooling · Sanitizer infrastructure",
      },
      {
        repository: "ROCm/rocm-libraries",
        title: "Fix an out-of-bounds read in rocSPARSE tests",
        date: "2026-10-04",
        url: "https://github.com/ROCm/rocm-libraries/pull/13044",
        description:
          "Corrected the BSR column-index copy size in rocSPARSE's conversion test helper, preventing host-buffer overreads when row and column index widths differ. All five existing mixed-index conversion cases passed on gfx942 hardware with host AddressSanitizer and leak detection enabled.",
        changes: "Memory safety · Sparse matrix testing",
      },
    ],
  },

  publications: [
    {
      title:
        "An Automated Framework to Classify Skin Lesions Using Multi-Head Self Attention Layer-Based Vision Transformers",
      authors: [
        "Sahil Faizal",
        "Charu Anant Rajput",
        "Manas Ranjan Prusty",
      ],
      venue: "Frontiers in Artificial Intelligence",
      year: "2026",
      type: "Journal",
      location: "Medicine and Public Health",
      pdf: "https://doi.org/10.3389/frai.2026.1781796",
      abstract:
        "An automated nine-class skin-lesion classification framework using contrast stretching for image enhancement and ROI segmentation, Vision Transformer feature extraction with multi-head self-attention, and a lightweight MLP classifier. The approach achieved 98% training accuracy and 93.22% test accuracy across combined HAM10000 and PAD-UFES datasets.",
    },
    {
      title:
        "Wave: A Symbolic Python DSL and Compiler for High-Performance Machine Learning",
      authors: [
        "Harsh Menon",
        "Oleksandr Zinenko",
        "Gaurav Verma",
        "Stanley Winata",
        "Ivan Butygin",
        "Nithin Meganathan",
        "Sanket Pandit",
        "William Gallard Hatch",
        "Surya Jasper",
        "Megan Kuo",
        "Sahil Faizal",
        "Ashay Rane",
        "Aurore De Spirlet",
        "Martin P. Lücke",
      ],
      venue: "MLSys 2026",
      year: "2026",
      type: "Conference",
      location: "Seattle, USA",
      pdf: "https://openreview.net/forum?id=gcXV1E8HRH",
      abstract:
        "Modern ML models demand ever-greater compute, prompting hardware vendors to add specialized matrix cores to their GPUs. While these units unlock high throughput, they impose intricate programming models and addressing schemes that are difficult to manage by hand. This paper introduces Wave, a Python-embedded DSL for kernel authoring that automates these complex address computations and lets authors focus on core computation. In experiments, it matches or surpasses the performance of state-of-the-art kernel DSLs and libraries.",
    },
    {
      title:
        "Training Indoor and Scene-Specific Semantic Segmentation Models to Assist Blind and Low Vision Users in Activities of Daily Living",
      authors: [
        "Ruijie Sun",
        "Giles Hamilton-Fletcher",
        "Sahil Faizal",
        "Chen Feng",
        "Todd E Hudson",
        "John-Ross Rizzo",
        "Kevin C Chan",
      ],
      venue: "IEEE Open Journal of Engineering in Medicine and Biology",
      year: "2025",
      type: "Journal",
      location: "USA",
      pdf: "https://ieeexplore.ieee.org/abstract/document/11153825",
      abstract:
        "Goal: Persons with blindness or low vision (pBLV) face challenges in completing activities of daily living (ADLs/IADLs). Semantic segmentation techniques on smartphones, like DeepLabV3+, can quickly assist in identifying key objects, but their performance across different indoor settings and lighting conditions remains unclear. Methods: Using the MIT ADE20K SceneParse150 dataset, we trained and evaluated AI models for specific indoor scenes (kitchen, bedroom, bathroom, living room) and compared them with a generic indoor model. Performance was assessed using mean accuracy and intersection-over-union metrics. Results: Scene-specific models outperformed the generic model, particularly in identifying ADL/IADL objects. Models focusing on rooms with more unique objects showed the greatest improvements (bedroom, bathroom). Scene-specific models were also more resilient to low-light conditions. Conclusions: These findings highlight how using scene-specific models can boost key performance indicators for assisting pBLV across different functional environments. We suggest that a dynamic selection of the best-performing models on mobile technologies may better facilitate ADLs/IADLs for pBLV.",
    },
    {
      title:
        "EmoRoom: Unveiling Academic Emotions Through Interactive Visual Analytics in Classroom Videos",
      authors: [
        "Rajamanickam Yuvaraj",
        "Sahil Faizal",
        "Rajalakshmi Ratnavel",
        "Wang Yang",
      ],
      venue: "Future Technologies Conference (FTC) 2024",
      year: "2024",
      type: "Conference",
      location: "London, UK",
      pdf: "https://link.springer.com/chapter/10.1007/978-3-031-73122-8_39",
      abstract:
        "Measuring emotions in educational settings can provide important information in predicting and explaining student learning outcomes. Knowledge of student’s classroom emotions can also help teachers understand their students’ learning behaviors, improve their teaching methods, and optimize students’ learning and development. However, it can be highly challenging for teachers to monitor and accurately understand student emotions within classroom or group contexts, especially while they are actively teaching and attending to many students simultaneously. Video recording classroom activity can address that issue as high-definition cameras can be used to continuously record groups of students, enabling online or offline analyses of student emotions and supplementing teacher monitoring, retrieval, and interpretation of those processes. Teachers find it difficult to use existing emotion recognition methods to analyze student behaviors in videos due to a lack of user-friendly interfaces that facilitate automatic analysis. To address this challenge, we developed EmoRoom, an open-source tool designed to simplify the annotation and analysis of videos from an emotional perspective. EmoRoom tool offers a practical solution for quantifying and visualizing the frequency of emotions for individuals of interest. Furthermore, it can assist teachers in refining their teaching methods by offering a comprehensive overview of students’ emotional experiences during learning.",
    },
    {
      title:
        "RiceSeedNet: Rice seed variety identification using deep neural network",
      authors: [
        "Ratnavel Rajalakshmi",
        "Sahil Faizal",
        "S. Sivasankaran",
        "R. Geetha",
      ],
      venue: "Journal of Agriculture and Food Research",
      year: "2024",
      type: "Journal",
      pdf: "hhttps://www.sciencedirect.com/science/article/pii/S2666154324000991",
      abstract:
        "Rice is one of the most important food crops in the South India. Many varieties of rice are cultivated in different regions of the India to meet the dietary needs of the ever-growing population. In spite of huge investment in terms of land, labour, raw materials and machinery, the farmers continuously face irrecoverable loss due to various reasons like climatic changes, drought situation and seed quality. In the current practice, the quality of the seeds is certified by the Seed Testing Laboratories (STL) and purity analysis is done manually by trained technicians. However, seed classification is not uniform across different labs, due to several factors like fatigue, eye-strain and personal circumstances of the technicians. Hence, automated rice seed variety identification becomes a crucial task for ensuring the quality and germination potential of rice crops. This research is focused on the application of Deep Neural Network (RiceSeedNet) combined with traditional image processing techniques to classify local rice seed varieties of southern Tamilnadu, India. The RiceSeed Image corpus is created for this purpose considering 13 local varieties. The captured RGB images of rice seed data consists of 13,000 images of local rice seed varieties, having 1000 images for each variety. To automate the rice seed varietal identification, vision transformer-based architecture RiceSeedNet is developed. The proposed RiceSeedNet is 97% accurate in classifying the 13 local varieties of rice seeds. The RiceSeedNet was also evaluated on a publicly available rice grain data set to study the performance of the proposed model across the different rice grain varieties. On this cross-data validation, RiceSeedNet is able to achieve 99% accuracy in classifying 8 varieties of rice grains on the public dataset.",
    },

    {
      title:
        "Automated cataract disease detection on anterior segment eye images using adaptive thresholding and fine tuned inception-v3 model",
      authors: [
        "Sahil Faizal",
        "Charu Anant Rajput",
        "Rupali Tripathi",
        "Bhumika Verma",
        "Manas Ranjan Prusty",
        "Shivani Sachin Korade",
      ],
      venue: "Biomedical Signal Processing and Control",
      year: "2023",
      type: "Journal",
      pdf: "https://www.sciencedirect.com/science/article/abs/pii/S1746809422010047",
      abstract:
        "Early detection of cataracts plays a vital role in ensuring the prevention of vision loss. This paper aims to propose an algorithm that will act as an assistive measure in the process of automating cataract disease detection. The majority of the existing works are focused on the utilization of either fundus images, slit lamp images, or visible wavelength images captured using a DSLR camera. The novelty of this proposed algorithm is the capability to deliver equally accurate and precise performance using both normally captured visible wavelength images as well as medically captured anterior segment images which can, in turn, prove to be cost-effective as well. The image pre-processing techniques particularly adaptive thresholding hereby employed provides fast and accurate results on the input dataset fed to the CNN model which in turn is a fine-tuned version of Inception-v3. Here the training of the model has been done using visible wavelength images whereas the validation testing has been done using the anterior segment eye images medically obtained from a hospital. The proposed image pre-processing technique along with the model architecture ensures the achievement of a high classification accuracy of about 95%. Since the model deals with the examination of the anterior segment of the image, cases concerning nuclear cataract, cortical cataract, or a hybrid case involving the detection of both the aforementioned cataract types lie under the range of detection of our system.",
    },

    {
      title:
        "Automated Identification of Tree Species by Bark Texture Classification Using Convolutional Neural Networks",
      authors: ["Sahil Faizal"],
      venue:
        "International Journal for Research in Applied Science & Engineering Technology (IJRASET)",
      year: "2022",
      type: "Journal",
      pdf: "https://arxiv.org/abs/2210.09290",
      abstract:
        "Identification of tree species plays a key role in forestry related tasks like forest conservation, disease diagnosis and plant production. There had been a debate regarding the part of the tree to be used for differentiation, whether it should be leaves, fruits, flowers or bark. Studies have proven that bark is of utmost importance as it will be present despite seasonal variations and provides a characteristic identity to a tree by variations in the structure. In this paper, a deep learning based approach is presented by leveraging the method of computer vision to classify 50 tree species, on the basis of bark texture using the BarkVN-50 dataset. This is the maximum number of trees being considered for bark classification till now. A convolutional neural network(CNN), ResNet101 has been implemented using transfer-learning based technique of fine tuning to maximise the model performance. The model produced an overall accuracy of >94% during the evaluation. The performance validation has been done using K-Fold Cross Validation and by testing on unseen data collected from the Internet, this proved the model's generalization capability for real-world uses.",
    },

    {
      title: "Wild Animal Classifier Using CNN",
      authors: ["Sahil Faizal", "Sanjay Sundaresan"],
      venue:
        "International Journal of Advanced Research in Science, Communication and Technology (IJARSCT)",
      year: "2022",
      type: "Journal",
      pdf: "https://arxiv.org/abs/2210.07973",
      abstract:
        "Classification and identification of wild animals for tracking and protection purposes has become increasingly important with the deterioration of the environment, and technology is the agent of change which augments this process with novel solutions. Computer vision is one such technology which uses the abilities of artificial intelligence and machine learning models on visual inputs. Convolution neural networks (CNNs) have multiple layers which have different weights for the purpose of prediction of a particular input. The precedent for classification, however, is set by the image processing techniques which provide nearly ideal input images that produce optimal results. Image segmentation is one such widely used image processing method which provides a clear demarcation of the areas of interest in the image, be it regions or objects. The Efficiency of CNN can be related to the preprocessing done before training. Further, it is a well-established fact that heterogeneity in image sources is detrimental to the performance of CNNs. Thus, the added functionality of heterogeneity elimination is performed by the image processing techniques, introducing a level of consistency that sets the tone for the excellent feature extraction and eventually in classification.",
    },
  ],

  talks: [
    {
      title: "Hybrid Agentic AI with vLLM Semantic Routing and FlyDSL",
      event: "AMD Advancing AI 2026",
      location: "Moscone Center, San Francisco, CA",
      date: "2026-07",
      type: "Talk",
      description:
        "Helped developers build agentic solutions across hybrid cloud and local environments using a vLLM semantic router, and demonstrated how FlyDSL enables fast Python kernels for performance-critical AI workloads.",
    },
    {
      title: "Building Agentic Applications with OpenClaw",
      event: "AMD Dev Day SF 2026",
      location: "San Francisco, CA",
      date: "2026-05",
      type: "Talk",
      post: "https://www.linkedin.com/posts/sf74_amd-aidevday-amdevs-ugcPost-7456137448390045696-ly6s/?utm_source=share&utm_medium=member_desktop&rcm=ACoAAC3X4Y4BB7T_1d9pk_OU1cVz0vO54m1Gz0I",
      description:
        "Guided developers through building and deploying personal AI agents with OpenClaw, from defining agent workflows and connecting tools to running agents locally and preparing them for real-world use. Covered practical design choices for reliable, private, and extensible personal-agent experiences.",
    },
    {
      title: "Behind the Compute: How LLMs Train, Infer, and Scale",
      event: "AMD Brown Bag Session",
      location: "San Jose, CA",
      date: "2025-11",
      type: "Talk",
      slides: "",
      video: "",
      description:
        "Presented a technical session on large language model workloads, exploring training strategies, parallelism approaches, and inference optimization, with insights from a MLPerf case study.",
    },
    {
      title: "SHARK-AI: AMD's Inference Engine for LLMs",
      event: "AMD Brown Bag Session",
      location: "San Jose, CA",
      date: "2025-06",
      type: "Talk",
      slides: "",
      description:
        "Delivered a talk on end-to-end SHARK-AI workflows, covering PyTorch graph capture, model export, inference serving, IREE codegen, and GPU kernel compilation and execution.",
    },
    // {
    //   title: "The Future of AI Training Infrastructure",
    //   event: "ML Conf 2023",
    //   location: "Austin, TX",
    //   date: "2023-11",
    //   type: "Panel",
    //   video: "https://youtube.com/talk3",
    //   description:
    //     "Participated in panel discussion on emerging trends in AI training infrastructure.",
    // },
  ],

  blogPosts: [
    {
      title: "ONNX & ONNX Runtime: Practitioner's Guide",
      slug: "onnx-and-onnx-runtime-practitioners-guide",
      date: "2026-04",
      categories: ["Inference", "Tools"],
      keywords: [
        "ONNX",
        "ONNX Runtime",
        "Model Export",
        "Inference",
        "Execution Providers",
      ],
      summary:
        "A practical guide to ONNX and ONNX Runtime: model IR, export workflows, execution providers, graph optimization, quantization, and deployment validation.",
      readTime: "11 min",
      externalUrl:
        "https://sahilfaizal.substack.com/p/onnx-and-onnx-runtime-practitioners",
      image:
        "https://substackcdn.com/image/fetch/$s_!zMvJ!,w_1200,h_675,c_fill,f_jpg,q_auto:good,fl_progressive:steep,g_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F6a3d1aaa-7df8-4873-a800-95cdf22c9188_1408x768.png",
      content: `
# ONNX & ONNX Runtime: Practitioner's Guide

This article lives on Substack, where the original formatting, diagrams, code blocks, and embedded visuals are preserved properly.

I cover ONNX as an intermediate representation for ML inference, ONNX Runtime execution providers, export best practices, graph optimization, numerical optimization, runtime configuration, and validation workflows for production deployment.

[Read the full article on Substack](https://sahilfaizal.substack.com/p/onnx-and-onnx-runtime-practitioners)
      `,
      references: [
        {
          title: "Original Substack article",
          url: "https://sahilfaizal.substack.com/p/onnx-and-onnx-runtime-practitioners",
        },
        {
          title: "ONNX Runtime Documentation",
          url: "https://onnxruntime.ai/docs/",
        },
      ],
    },
    {
      title:
        "Building Efficient Networks for LLM Training: From Rail-Optimized to Rail-Only Designs",
      slug: "building-efficient-networks-for-llm-training",
      date: "2026-01",
      categories: ["Training", "AI Infrastructure"],
      keywords: [
        "LLM Training",
        "Distributed Training",
        "GPU Networking",
        "Rail-Only Networks",
        "AI Infrastructure",
      ],
      summary:
        "A systems look at rail-optimized and rail-only network designs for large-scale LLM training, and how topology choices can cut infrastructure cost while preserving training performance.",
      readTime: "10 min",
      externalUrl:
        "https://sahilfaizal.substack.com/p/building-efficient-networks-for-llm",
      image:
        "https://substackcdn.com/image/fetch/$s_!qB6X!,w_1200,h_675,c_fill,f_jpg,q_auto:good,fl_progressive:steep,g_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F8bd16ee8-a483-4a88-b060-1f61bd587a6b_1024x559.jpeg",
      content: `
# Building Efficient Networks for LLM Training

This article lives on Substack, where the original formatting, diagrams, and network topology visuals are preserved properly.

I walk through rail-optimized and rail-only network designs for large-scale LLM training, explaining how workload-aware topology choices can reduce network cost and power while preserving training performance.

[Read the full article on Substack](https://sahilfaizal.substack.com/p/building-efficient-networks-for-llm)
      `,
      references: [
        {
          title: "Original Substack article",
          url: "https://sahilfaizal.substack.com/p/building-efficient-networks-for-llm",
        },
        {
          title:
            "Rail-only: A Low-Cost High-Performance Network for Training LLMs with Trillion Parameters",
          url: "https://arxiv.org/pdf/2307.12169",
        },
      ],
    },
  ],

  photography: [
    {
      location: "Swiss Alps, Switzerland",
      date: "2024-08",
      coverImage:
        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
      photos: [
        {
          image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
          title: "Sunrise at Matterhorn",
          description: "Golden hour illuminating the iconic Matterhorn peak",
        },
        {
          image: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7",
          title: "Alpine Meadows",
          description: "Wildflowers blooming in the high alpine meadows",
        },
        {
          image: "https://images.unsplash.com/photo-1531973576160-7125cd663d86",
          title: "Mountain Lake",
          description:
            "Crystal clear glacial lake reflecting the surrounding peaks",
        },
        {
          image: "https://images.unsplash.com/photo-1434725039720-aaad6dd32dfe",
          title: "Cable Car Journey",
          description: "Ascending through the clouds to reach the summit",
        },
      ],
    },
    {
      location: "Tokyo, Japan",
      date: "2024-05",
      coverImage:
        "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf",
      photos: [
        {
          image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf",
          title: "Shibuya Crossing",
          description: "The famous scramble crossing illuminated at night",
        },
        {
          image: "https://images.unsplash.com/photo-1513407030348-c983a97b98d8",
          title: "Neon Alleyways",
          description: "Narrow streets filled with colorful signs and lanterns",
        },
        {
          image: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26",
          title: "Tokyo Tower at Dusk",
          description:
            "The iconic tower standing tall against the twilight sky",
        },
        {
          image: "https://images.unsplash.com/photo-1492571350019-22de08371fd3",
          title: "Traditional Temple",
          description: "Ancient architecture amidst the modern cityscape",
        },
        {
          image: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc",
          title: "Cherry Blossom Season",
          description: "Sakura trees in full bloom along the river",
        },
      ],
    },
    {
      location: "Big Sur, California",
      date: "2024-03",
      coverImage:
        "https://images.unsplash.com/photo-1511739001486-6bfe10ce785f",
      photos: [
        {
          image: "https://images.unsplash.com/photo-1511739001486-6bfe10ce785f",
          title: "Bixby Bridge",
          description: "The iconic bridge spanning the coastal canyon",
        },
        {
          image: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29",
          title: "McWay Falls",
          description: "Waterfall cascading onto the pristine beach below",
        },
        {
          image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
          title: "Coastal Sunset",
          description: "Sun setting over the Pacific Ocean horizon",
        },
      ],
    },
    {
      location: "Sahara Desert, Morocco",
      date: "2023-11",
      coverImage:
        "https://images.unsplash.com/photo-1509316785289-025f5b846b35",
      photos: [
        {
          image: "https://images.unsplash.com/photo-1509316785289-025f5b846b35",
          title: "Dune Patterns",
          description: "Wind-sculpted sand creating mesmerizing patterns",
        },
        {
          image: "https://images.unsplash.com/photo-1473580044384-7ba9967e16a0",
          title: "Starry Night",
          description: "Milky Way visible above the desert dunes",
        },
        {
          image: "https://images.unsplash.com/photo-1511497584788-876760111969",
          title: "Camel Caravan",
          description: "Traditional transport crossing the vast desert",
        },
        {
          image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800",
          title: "Desert Sunrise",
          description: "First light painting the dunes in golden hues",
        },
      ],
    },
    {
      location: "Iceland",
      date: "2023-09",
      coverImage:
        "https://images.unsplash.com/photo-1504893524553-b855bce32c67",
      photos: [
        {
          image: "https://images.unsplash.com/photo-1504893524553-b855bce32c67",
          title: "Northern Lights",
          description: "Aurora borealis dancing across the arctic sky",
        },
        {
          image: "https://images.unsplash.com/photo-1483347756197-71ef80e95f73",
          title: "Skógafoss Waterfall",
          description: "Massive waterfall cascading down the cliffs",
        },
        {
          image: "https://images.unsplash.com/photo-1476610182048-b716b8518aae",
          title: "Jökulsárlón Glacier",
          description: "Icebergs floating in the glacial lagoon",
        },
      ],
    },
    {
      location: "Santorini, Greece",
      date: "2023-07",
      coverImage:
        "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff",
      photos: [
        {
          image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff",
          title: "Oia Sunset",
          description: "White-washed buildings glowing in the sunset light",
        },
        {
          image: "https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e",
          title: "Blue Domes",
          description: "Iconic blue-domed churches overlooking the caldera",
        },
        {
          image: "https://images.unsplash.com/photo-1533105079780-92b9be482077",
          title: "Aegean Views",
          description: "Dramatic cliffs meeting the deep blue sea",
        },
      ],
    },
    {
      location: "Patagonia, Argentina",
      date: "2023-04",
      coverImage:
        "https://images.unsplash.com/photo-1501594907352-04cda38ebc29",
      photos: [
        {
          image: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29",
          title: "Torres del Paine",
          description: "The famous granite towers piercing the sky",
        },
        {
          image: "https://images.unsplash.com/photo-1482192505345-5655af888803",
          title: "Perito Moreno Glacier",
          description: "Massive glacier walls in brilliant blue and white",
        },
        {
          image: "https://images.unsplash.com/photo-1519681393784-d120267933ba",
          title: "Mountain Reflection",
          description: "Peaks mirrored perfectly in the still lake",
        },
      ],
    },
    {
      location: "New Zealand",
      date: "2023-02",
      coverImage:
        "https://images.unsplash.com/photo-1469521669194-babb45599def",
      photos: [
        {
          image: "https://images.unsplash.com/photo-1469521669194-babb45599def",
          title: "Milford Sound",
          description: "Dramatic fjord surrounded by towering peaks",
        },
        {
          image: "https://images.unsplash.com/photo-1507699622108-4be3abd695ad",
          title: "Lake Tekapo",
          description: "Turquoise waters under the Southern Alps",
        },
        {
          image: "https://images.unsplash.com/photo-1589802829985-817e51171b92",
          title: "Glowworm Caves",
          description: "Magical bioluminescent ceiling in the caves",
        },
      ],
    },
  ],

  books: [
    {
      title: "Designing Data-Intensive Applications",
      author: "Martin Kleppmann",
      cover:
        "https://images-na.ssl-images-amazon.com/images/I/51ZSpMl1-2L._SX379_BO1,204,203,200_.jpg",
      rating: 5,
      dateRead: "2024-08",
      review:
        "An excellent deep dive into the fundamentals of distributed systems and data storage. Essential reading for anyone building scalable applications.",
      categories: ["Distributed Systems", "Architecture"],
      link: "https://dataintensive.net/",
    },
    {
      title: "The Hundred-Page Machine Learning Book",
      author: "Andriy Burkov",
      cover:
        "https://images-na.ssl-images-amazon.com/images/I/41vS04GVdCL._SX384_BO1,204,203,200_.jpg",
      rating: 4,
      dateRead: "2024-06",
      review:
        "Concise and well-written introduction to machine learning concepts. Perfect for getting up to speed quickly on ML fundamentals.",
      categories: ["Training"],
      link: "http://themlbook.com/",
    },
    {
      title: "Building Machine Learning Powered Applications",
      author: "Emmanuel Ameisen",
      cover:
        "https://images-na.ssl-images-amazon.com/images/I/51U4C3eqHSL._SX379_BO1,204,203,200_.jpg",
      rating: 5,
      dateRead: "2024-04",
      review:
        "Practical guide to taking ML models from notebooks to production. Covers the full lifecycle including monitoring and iteration.",
      categories: ["Tools", "Inference"],
      link: "https://www.oreilly.com/library/view/building-machine-learning/9781492045106/",
    },
    {
      title:
        "Accelerate: Building and Scaling High Performing Technology Organizations",
      author: "Nicole Forsgren, Jez Humble, Gene Kim",
      cover:
        "https://images-na.ssl-images-amazon.com/images/I/41juS4n+tPL._SX329_BO1,204,203,200_.jpg",
      rating: 5,
      dateRead: "2024-02",
      review:
        "Data-driven insights into what makes high-performing tech teams. Changed how I think about DevOps and organizational efficiency.",
      categories: ["Tools", "Architecture"],
      link: "https://itrevolution.com/product/accelerate/",
    },
    {
      title: "Deep Learning",
      author: "Ian Goodfellow, Yoshua Bengio, Aaron Courville",
      cover:
        "https://images-na.ssl-images-amazon.com/images/I/61fim5QqaqL._SX373_BO1,204,203,200_.jpg",
      rating: 5,
      dateRead: "2023-11",
      review:
        "The definitive textbook on deep learning. Comprehensive coverage of neural networks, optimization, and modern architectures.",
      categories: ["Training", "Architecture"],
      link: "https://www.deeplearningbook.org/",
    },
  ],

  researchPapers: [
    {
      title: "Attention Is All You Need",
      authors: "Vaswani et al.",
      venue: "NeurIPS 2017",
      year: "2017",
      pdf: "https://arxiv.org/abs/1706.03762",
      summary:
        "Introduced the Transformer architecture that revolutionized natural language processing and became the foundation for modern LLMs like GPT and BERT.",
      keyTakeaways: [
        "Self-attention mechanism eliminates need for recurrence",
        "Parallel processing enables faster training",
        "Positional encoding preserves sequence information",
        "Multi-head attention captures different representation subspaces",
      ],
      tags: ["Architecture", "Training"],
    },
    {
      title:
        "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
      authors: "Devlin et al.",
      venue: "NAACL 2019",
      year: "2019",
      pdf: "https://arxiv.org/abs/1810.04805",
      summary:
        "Introduced bidirectional pre-training for language models, achieving state-of-the-art results across multiple NLP tasks through masked language modeling.",
      keyTakeaways: [
        "Bidirectional context improves language understanding",
        "Masked language modeling as effective pre-training objective",
        "Transfer learning through fine-tuning on downstream tasks",
        "WordPiece tokenization handles vocabulary efficiently",
      ],
      tags: ["Training", "Post-Training"],
    },
    {
      title: "GPT-3: Language Models are Few-Shot Learners",
      authors: "Brown et al.",
      venue: "NeurIPS 2020",
      year: "2020",
      pdf: "https://arxiv.org/abs/2005.14165",
      summary:
        "Demonstrated that scaling language models to 175B parameters enables few-shot learning without fine-tuning, fundamentally changing how we approach NLP tasks.",
      keyTakeaways: [
        "Scale enables emergent capabilities and in-context learning",
        "Few-shot performance improves dramatically with model size",
        "Prompting as a new paradigm for task specification",
        "Challenges around bias, safety, and energy consumption",
      ],
      tags: ["Inference", "Training"],
    },
    {
      title: "LoRA: Low-Rank Adaptation of Large Language Models",
      authors: "Hu et al.",
      journal: "ICLR 2022",
      year: "2022",
      pdf: "https://arxiv.org/abs/2106.09685",
      summary:
        "Efficient fine-tuning method that reduces trainable parameters by up to 10,000x while maintaining performance by learning low-rank decomposition matrices.",
      keyTakeaways: [
        "Freeze base model and learn low-rank updates",
        "Drastically reduces memory and storage requirements",
        "Enables efficient multi-task learning",
        "No inference latency compared to full fine-tuning",
      ],
      tags: ["Post-Training", "Training"],
    },
    {
      title:
        "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness",
      authors: "Dao et al.",
      venue: "NeurIPS 2022",
      year: "2022",
      pdf: "https://arxiv.org/abs/2205.14135",
      summary:
        "IO-aware exact attention algorithm that speeds up Transformers by 2-4x and reduces memory usage, enabling longer context lengths.",
      keyTakeaways: [
        "Account for GPU memory hierarchy in algorithm design",
        "Tiling and recomputation reduce HBM accesses",
        "Enables training with longer sequences",
        "Exact attention (no approximation) with better performance",
      ],
      tags: ["GPU Programming", "Inference"],
    },
    {
      title: "Distributed Deep Learning: A Survey",
      authors: "Mayer & Jacobsen",
      journal: "ACM Computing Surveys",
      year: "2023",
      pdf: "https://arxiv.org/abs/2301.02049",
      summary:
        "Comprehensive survey of distributed deep learning techniques including data parallelism, model parallelism, and pipeline parallelism strategies.",
      keyTakeaways: [
        "Trade-offs between communication and computation",
        "Gradient compression techniques reduce bandwidth",
        "Hybrid parallelism strategies for large models",
        "Fault tolerance critical at scale",
      ],
      tags: ["Distributed Systems", "Training", "HPC"],
    },
  ],
};
