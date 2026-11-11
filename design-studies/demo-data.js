/* 风格参考稿共享的真实内容样本（只读，不参与站点构建） */
window.DEMO = (function () {
  const posts = [
    {
      id: 'X-082',
      n: '082',
      date: '2026-08-26',
      category: '工程实践',
      title: '芯片架构与编译器',
      readTime: '5 分钟',
      tags: ['性能优化', 'ISA'],
      abstract:
        '当我们在 GitHub 下载开源代码的 release 时，经常看到 x86_64、arm、amd64 等字样。它们都是指令集架构的名字。本文围绕芯片、指令集、系统位数与编译器，把这些概念放回同一条链路里。',
    },
    {
      id: 'X-081',
      n: '081',
      date: '2026-06-13',
      category: '工程实践',
      title: '定时器的原理和应用',
      readTime: '6 分钟',
      tags: ['STM32', '嵌入式'],
      abstract:
        '定时器是单片机的核心外设之一，中断服务函数与 PWM 输出都离不开它。从时钟源、预分频器、计数器到自动重装载，拆开看它的四个组成部分。',
    },
    {
      id: 'X-080',
      n: '080',
      date: '2026-06-11',
      category: '算法与数据',
      title: '重要性采样在强化学习中的应用',
      readTime: '4 分钟',
      tags: ['AI', '数学'],
      abstract:
        '想估计函数在分布 P 上的期望，却只能从分布 Q 采样，于是需要一个权重来修正。这个权重叫重要性权重，这个方法叫重要性采样。',
    },
    {
      id: 'X-079',
      n: '079',
      date: '2026-06-11',
      category: '算法与数据',
      title: '策略梯度定理',
      readTime: '10 分钟',
      tags: ['AI', '数学'],
      abstract:
        '策略梯度定理是强化学习中优雅而核心的基石。面对连续动作空间与复杂动力学，理解这个定理是设计高效算法的前提。',
    },
    {
      id: 'X-078',
      n: '078',
      date: '2026-06-09',
      category: '算法与数据',
      title: '熵，交叉熵与 KL 散度',
      readTime: '5 分钟',
      tags: ['数学', '信息论'],
      abstract:
        '太多人知道如何计算交叉熵损失，却不知道为何这样计算。本文由浅入深，把熵、交叉熵与 KL 散度放回同一个信息论视角。',
    },
    {
      id: 'X-075',
      n: '075',
      date: '2026-05-28',
      category: '论文研读',
      title: '飞行器笔记资料',
      readTime: '8 分钟',
      tags: ['ROS', '设备'],
      abstract:
        '多旋翼飞行器实验笔记：场地搭建、电机拉力测试平台、力效计算，以及调试过程中反复踩到的那些坑。',
    },
    {
      id: 'X-074',
      n: '074',
      date: '2026-05-28',
      category: '论文研读',
      title: '基于水动力学的多智能体拖轮的协同框架',
      readTime: '20 分钟',
      tags: ['AI', '控制'],
      abstract:
        '围绕多拖轮协同作业，构建基于三自由度水动力学的强化学习仿真与控制框架；控制输入为舵角与螺旋桨转速的二维连续动作空间。',
    },
    {
      id: 'X-073',
      n: '073',
      date: '2026-01-28',
      category: '系统与网络',
      title: 'uv 教程',
      readTime: '3 分钟',
      tags: ['Python', '工具链'],
      abstract:
        '用 uv 管理 Python 项目：集成解释器与项目创建、轻量的脚本运行、精确的依赖管理，以及那些容易忽略的细节。',
    },
    {
      id: 'X-071',
      n: '071',
      date: '2025-12-10',
      category: '系统与网络',
      title: 'git 常用操作',
      readTime: '5 分钟',
      tags: ['git', '备忘'],
      abstract: '一份常用命令速查表：初始化、查看变更、暂存提交、历史与分支，作为日常使用的备忘。',
    },
    {
      id: 'X-053',
      n: '053',
      date: '2025-09-04',
      category: '论文研读',
      title: 'GPT-4 技术报告解析',
      readTime: '3 分钟',
      tags: ['AI'],
      abstract:
        '《GPT-4 Technical Report》没有披露太多技术细节，更像一份强调能力与安全边界的宣传手册。本文梳理其中可以确认的部分。',
    },
    {
      id: 'X-038',
      n: '038',
      date: '2025-08-20',
      category: '论文研读',
      title: '【论文精读】Distilling the Knowledge in a Neural Network',
      readTime: '5 分钟',
      tags: ['AI', '蒸馏'],
      abstract:
        'Hinton、Vinyals 与 Dean 在 2015 年提出的知识蒸馏，把大模型的软标签迁移到小模型。本文逐节拆解这篇深度学习领域的经典论文。',
    },
    {
      id: 'X-015',
      n: '015',
      date: '2024-10-08',
      category: '生活随记',
      title: '青岛秋冬季穿衣指南',
      readTime: '2 分钟',
      tags: ['穿搭', '青岛'],
      abstract:
        '青岛只有夏季和冬季——不知道谁说的。十月的风一起，穿衣就变成一道每年都要重做的题。',
    },
  ];

  const categories = ['工程实践', '算法与数据', '系统与网络', '论文研读', '生活随记'];

  const article = {
    id: 'X-080',
    title: '重要性采样在强化学习中的应用',
    category: '算法与数据',
    date: '2026-06-11',
    updated: '2026-06-11',
    author: 'James',
    readTime: '约 8 分钟',
    tags: ['AI', '数学', '重要性采样'],
    abstract:
      '当你想要评估一个函数在分布 P 上的期望，却无法直接采样，于是从另一个分布 Q 采样，再用权重去修正。本文从数学本质出发，走到它在强化学习与 PPO 中的工程形态。',
    body: `
      <p class="lede">当你想要评估一个函数在一个分布 <em>P</em> 上的期望，但是无法从这个分布直接采样，于是从另一个分布 <em>Q</em> 去采样，然后计算在 <em>P</em> 上的期望。因为是从 <em>Q</em> 上采样的，所以需要一个权重去修正。这种修正的方法，就叫重要性采样。</p>

      <h2 id="sec-1"><span class="secnum">01</span>数学本质</h2>
      <p>重要性采样是一个“加权”的过程：用分布 <em>Q</em> 产生的数据，去估计分布 <em>P</em> 的期望值。那个权重，就叫<strong>重要性权重</strong>（importance weight）。</p>
      <p>在统计学中，我们想求函数 <em>f(x)</em> 在真实分布 <em>p(x)</em> 下的期望，但我们只能从另一个分布 <em>q(x)</em> 中采样。根据期望的定义，做一个简单的数学变换：</p>

      <div class="formula" role="math" aria-label="E p f equals sum q p over q times f">
        <span class="formula-line">E<sub>x∼p</sub>[ f(x) ]</span>
        <span class="formula-op">=</span>
        <span class="formula-line">Σ<sub>x</sub> q(x) · <span class="frac"><span>p(x)</span><span>q(x)</span></span> · f(x)</span>
        <span class="formula-op">=</span>
        <span class="formula-line">E<sub>x∼q</sub>[ <span class="frac"><span>p(x)</span><span>q(x)</span></span> f(x) ]</span>
      </div>

      <p>结论非常优雅：你可以从 <em>q(x)</em> 中采样，但要把每次得到的结果乘以一个比例 <em>p(x)/q(x)</em>。这个比例就是重要性权重。</p>
      <ul>
        <li>如果 <em>p(x) &gt; q(x)</em>，权重 &gt; 1，说明这个样本在目标分布中更重要，要放大它的影响。</li>
        <li>如果 <em>p(x) &lt; q(x)</em>，权重 &lt; 1，说明要缩小它的影响。</li>
      </ul>

      <figure>
        <img src="media/importance-peaks.webp" alt="分布 p 与 q 的峰值与重要性权重示意" />
        <figcaption><span class="figlabel">图 1</span>p(x) 的 peak 附近会拉高权重，让采样时增加影响。</figcaption>
      </figure>

      <blockquote>
        <p>权重不是对样本的“奖励”，而是对采样分布与目标分布之间差异的校正。</p>
      </blockquote>

      <h2 id="sec-2"><span class="secnum">02</span>强化学习中的应用</h2>
      <p>在强化学习中，我们有两个策略：<strong>目标策略 π</strong>（正在训练、想要评估的策略）与<strong>行为策略 μ</strong>（实际与环境交互、收集数据的旧策略）。我们想计算目标策略跑完一局（一条轨迹 τ）的期望总回报，但手头只有行为策略跑出来的数据。</p>
      <p>一条轨迹 τ = (s₀, a₀, s₁, a₁, …, s_T) 在策略 π 下发生的概率是：</p>

      <div class="formula">
        <span class="formula-line">P<sub>π</sub>(τ) = P(s₀) ∏<sub>t=0</sub><sup>T</sup> π(a<sub>t</sub>|s<sub>t</sub>) P(s<sub>t+1</sub>|s<sub>t</sub>, a<sub>t</sub>)</span>
      </div>

      <p>初始状态概率与状态转移概率在分子分母中完全一致，被约掉之后，权重只剩下动作概率的连乘：</p>

      <div class="formula formula--accent">
        <span class="formula-line">ρ = ∏<sub>t=0</sub><sup>T</sup> <span class="frac"><span>π(a<sub>t</sub>|s<sub>t</sub>)</span><span>μ(a<sub>t</sub>|s<sub>t</sub>)</span></span></span>
      </div>

      <p>强化学习中，我们通常不知道环境的动态模型（比如游戏内部的物理引擎）。重要性采样让我们绕过了环境模型，只需要知道新策略采取该动作的概率除以旧策略采取该动作的概率，再连乘起来即可。</p>

      <p>这个比值在 PPO 里变成了裁剪目标：</p>
      <pre data-lang="python"><code>ratio = torch.exp(logp - logp_old)
surr1 = ratio * advantage
surr2 = torch.clamp(ratio, 1 - eps, 1 + eps) * advantage
loss = -torch.min(surr1, surr2).mean()</code></pre>

      <p>三种常见估计量的差异，可以用一张表概括：</p>
      <div class="table-wrap">
        <table>
          <caption>表 1 · 三类估计量的偏差与方差</caption>
          <thead>
            <tr><th>估计量</th><th>使用数据</th><th>偏差</th><th>方差</th></tr>
          </thead>
          <tbody>
            <tr><td>普通重要性采样</td><td>整条轨迹</td><td>无偏</td><td>随步长指数增长</td></tr>
            <tr><td>逐步重要性采样</td><td>单步转移</td><td>有偏</td><td>可控</td></tr>
            <tr><td>PPO 裁剪目标</td><td>当前策略近邻</td><td>有偏</td><td>低且稳定</td></tr>
          </tbody>
        </table>
      </div>

      <h2 id="sec-3"><span class="secnum">03</span>数学目的与工程结果的统一</h2>
      <p>重要性采样的出发点只是“换一个能采样的分布”，但它在工程上带来了两件事：一是样本复用，旧策略收集的数据可以被多次利用；二是把策略改进约束在一个可信的邻域内。<sup class="fnref"><a href="#fn-1">1</a></sup></p>
      <p>代价同样清楚：权重连乘的方差会随轨迹长度迅速放大，于是有了截断、逐步估计与 KL 约束这些工程折中。数学上的无偏，和工程上的可用，往往不是同一个东西。</p>

      <section class="footnotes">
        <h3>注释</h3>
        <ol>
          <li id="fn-1">这里隐含假设 q(x) 在 p(x) 的支撑集上处处大于零，否则权重无定义。</li>
        </ol>
      </section>
    `,
  };

  return { posts, categories, article };
})();
