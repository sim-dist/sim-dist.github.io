## Task

### Overview
You will be designing a website that will accompany this paper: [SimDist](assets/paper/simdist_paper.pdf). Carefully read this paper first, before proceeding.

### Goals
- Visually appealing (this is extremely important)
- Easy to navigate
- Provide a clear overview of the paper's main findings and contributions
- Interactive and engaging so that visitors will want to explore the content

### Guidelines
- You do not need to present things in the order they are presented in the paper or in this document. You can rearrange the content in a way that you think is most effective for communicating the key points.
- You can use any design elements, colors, fonts, and layout that you think will make the website visually appealing and easy to navigate. However, please keep in mind that the design should be professional and appropriate for an academic audience.
- You can use any tools or technologies that you are comfortable with to create the website, but it should be accessible and viewable on standard web browsers without requiring any special plugins or software.
- You should include interactive elements such as charts, graphs, or animations to help illustrate the key findings and contributions of the paper. For example, you could create interactive visualizations of the results presented in the paper, or you could create animations that show how the proposed method works.


## Details

### The paper's findings and contributions
I want to make sure we tell the below story. You may distill your own summary of the paper's main findings and contributions in order to supplement the below points.

1. Despite many impressive demos with sim-to-real policies in recent years, policies inevitably experience failure modes due to the dynamics gap between sim and real. Previous works have used end-to-end policy optimization to finetune sim-to-real policies with RL to bridge the gap. However, these approaches often catastrophically forget the priors learned in simulation, causing performance to degrade when finetuning with limited data. The key limitation of these methods is that these end-to-end policy optimization algorithms entangle learning dynamics, representations, and returns…attempting to relearn the entire task structure in the new domain. 
2. We argue that world models are the right vehicle for transferring experience from simulation to reality. Our key insight is that world models decompose task structure in a modular format we can exploit for efficient real-world adaptation. Specifically, world model architectures often look something like the following: first we have a state encoder when learns a scene representation from raw images, next we have a latent dynamics model which makes predictions conditioned on actions, and finally we have reward and value models which rank the quality of different trajectories. This structure enables us to make decisions in new environments with online planning and reasoning, rather than needing to solve the difficult reinforcement learning problem.
3. However this raises the question: what components of the world model can be transferred directly to the real world, and what modules need to be finetuned? Ideally we would like to learn only what is needed in new environments to make adaptation as efficient as possible. (i) Many recent works have shown that extensive visual randomizations enable training robust encoders which overcome the sim-to-real gaps (this can be transferred); (ii) similarly, the planner relies on the reward and value models to distinguish between high-value and low-value regions of the state space, which is also largely invariant across simulation and reality (can be transferred); (iii) the dynamics model is the most difficult to transfer, as it is the component that directly models the transition dynamics of the environment, which can differ significantly between simulation and reality (needs to be finetuned).
4. In light of this, we propose adapting in the real world by finetuning only the dynamics model, keeping the rest of the world model completely frozen. Specifically, we repeatedly plan with the current world model, collect real hardware data, and then use this data to finetune the latent dynamics model.
5. This reduces real world adaptation to a simple, supervised system identification problem. In particular, the online planning enables us to immediately modify and improve behavior as predictions improve. Notably, this completely side-steps the long-horizon bootstrapping problems which are the main challenge for existing end-to-end reinforcement learning methods.

### Figures
Here, I provide an overview of the figures in [figures](assets/figures), which are from the paper. You don't have to use all of these figures, unless otherwise specified.

- [fig1](assets/figures/fig1_stills-of-exps.png): This figure shows still images of the real-world experiments. It probably isn't needed since we have videos.
- [fig2](assets/figures/fig2_simdist-overview.png): This figure shows an overview of the SimDist method. This figure must be included. However, the figure is quite dense / busy, so maybe we should break it up into panels. Also, I think it would be great to figure out how to make the figure interactive. There is an SVG version of the figure [here](assets/figures/fig2_simdist-overview.svg).
- [fig3](assets/figures/fig3_world-model-arch-simple.png): This figure shows an overview of the world model architecture.
- [fig4](assets/figures/fig4_results-with-robots.png): This figure shows plots of the experiment results. I provide the raw data for these plots [here](assets/data/results.json). It would be great to make these plots interactive. Perhaps hovering over different items in the legend could highlight the corresponding lines in the plot, or clicking on items in the legend could toggle the visibility of different lines. Also, maybe hovering / clicking on different plots could show the corresponding videos of the real-world experiments.
- [fig5](assets/figures/fig5_value-overlay.png): This figure shows values predictions vs time during a successful and failed run. Overlaid on top, are stills from the corresponding videos at various points. It would be great to make the figure interactive. For example, hovering over different points in the plot could show the corresponding video frames. The raw data for the plot are [here](assets/data/values_success.csv) and [here](assets/data/values_fail.csv).
- [fig7a](assets/figures/fig7a_consistency-loss-plot.png): This figure shows the latent dynamics loss during a real-world quadruped run, both for the pretrained and finetuned models.


### Videos
Here, I provide an overview of the videos in [video](assets/video). You don't have to use all of these videos, unless otherwise specified. All videos should play automatically, and should be muted by default. 

- <video controls src="assets/video/failures_sequential.mp4" title="Title"></video>: This video shows failures on all 4 tasks.
- <video controls src="assets/video/manip_leg_results.mp4" title="Title"></video>, <video controls src="assets/video/manip_peg_results.mp4" title="Title"></video>, <video controls src="assets/video/qped_ptfe_results.mp4" title="Title"></video>, <video controls src="assets/video/qped_foam_results.mp4" title="Title"></video>: These videos show the real-world results for all 4 tasks. It would be great to somehow link these videos to the plots in fig4.
- <video controls src="assets/video/ptfe_plan.mp4" title="Title"></video>, <video controls src="assets/video/foam_plan.mp4" title="Title"></video>: These videos show planning happening in real-time using the world model during quadruped tasks. They are shown split screen, with the top half showing planning and the bottom half showing the real-world execution, synced in time. These are very impressive and visually appealing videos, so they must be included and should be prominently featured.
- <video controls src="assets/video/foot_pred_slip.mp4" title="Title"></video>: This video shows the foot predictions during a slip on the quadruped task. This is from figure 7 in the paper. Here, we show that the finetuned model is able to predict the slip, while the pretrained model is not. This video must be included.
- <video controls src="assets/video/hero-background-desktop.mp4" title="Title"></video>: This video shows a montage of the real-world experiments and planning. It is visually appealing. I originally intended to use this as a hero video, however I will leave it up to you to decide if/where to use it.

### Other Details
- The website should include a link to the full paper and to the code repository [here](https://github.com/CLeARoboticsLab/simdist).
