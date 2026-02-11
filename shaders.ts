export const vertexShaderSource = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

export const terrainFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D pointsTexture;
  uniform sampler2D valuesTexture;
  uniform int pointCount;
  uniform float sigma;
  uniform vec2 resolution;
  uniform vec2 offset;
  uniform float scale;
  uniform int isSurvival;

  float gaussian2D(vec2 point, vec2 center) {
    vec2 d = (point - center);
    return exp(-(d.x * d.x + d.y * d.y) / (2.0 * sigma * sigma));
  }

  vec3 spectral(float value) {
    float t = clamp((value + 1.0) / 2.0, 0.0, 1.0);
    vec3 color;
    if (t <= 0.2) color = mix(vec3(0.0, 0.1, 0.3), vec3(0.0, 0.4, 0.8), t/0.2);
    else if (t <= 0.4) color = mix(vec3(0.0, 0.4, 0.8), vec3(0.1, 0.8, 0.9), (t-0.2)/0.2);
    else if (t <= 0.6) color = mix(vec3(0.1, 0.8, 0.9), vec3(0.2, 0.9, 0.4), (t-0.4)/0.2);
    else if (t <= 0.8) color = mix(vec3(0.2, 0.9, 0.4), vec3(1.0, 0.9, 0.2), (t-0.6)/0.2);
    else color = mix(vec3(1.0, 0.9, 0.2), vec3(1.0, 0.2, 0.0), (t-0.8)/0.2);
    return color;
  }

  void main() {
    vec2 screenPos = vUv * resolution;
    vec2 worldPos = (vec2(screenPos.x, resolution.y - screenPos.y) - offset) / scale;
    float value = 0.0;
    for(int i = 0; i < 2000; i++) {
      if (i >= pointCount) break;
      vec2 pt = texture2D(pointsTexture, vec2((float(i) + 0.5) / 1024.0, 0.5)).xy;
      float val = texture2D(valuesTexture, vec2((float(i) + 0.5) / 1024.0, 0.5)).r;
      value += val * gaussian2D(worldPos, pt);
    }
    
    vec3 col;
    if (isSurvival == 1) {
      if (value > 0.0) {
        col = vec3(0.93, 0.26, 0.26); // Red for upregulated/amplification
      } else {
        col = vec3(0.14, 0.38, 0.92); // Blue for downregulated/inhibition
      }
    } else {
      col = spectral(value);
    }
    
    float intensity = clamp(abs(value) * 3.0, 0.0, 1.0);
    gl_FragColor = vec4(col, 0.7 * intensity + 0.1);
  }
`;

export const contourFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D pointsTexture;
  uniform sampler2D valuesTexture;
  uniform int pointCount;
  uniform float sigma;
  uniform vec2 resolution;
  uniform vec2 offset;
  uniform float scale;
  uniform float lineThickness;
  uniform float isolineSpacing;

  float gaussian2D(vec2 point, vec2 center) {
    vec2 d = (point - center);
    return exp(-(d.x * d.x + d.y * d.y) / (2.0 * sigma * sigma));
  }

  void main() {
    vec2 screenPos = vUv * resolution;
    vec2 worldPos = (vec2(screenPos.x, resolution.y - screenPos.y) - offset) / scale;
    float value = 0.0;
    for(int i = 0; i < 2000; i++) {
      if (i >= pointCount) break;
      vec2 pt = texture2D(pointsTexture, vec2((float(i) + 0.5) / 1024.0, 0.5)).xy;
      float val = texture2D(valuesTexture, vec2((float(i) + 0.5) / 1024.0, 0.5)).r;
      value += val * gaussian2D(worldPos, pt);
    }
    float scaledValue = value / isolineSpacing;
    float discreteValue = floor(scaledValue + 0.5);
    float isoline = abs(scaledValue - discreteValue);
    if (isoline < lineThickness) {
      gl_FragColor = vec4(0.0, 0.8, 0.9, 1.0);
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
  }
`;

export const peaksFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D pointsTexture;
  uniform sampler2D valuesTexture;
  uniform int pointCount;
  uniform float sigma;
  uniform vec2 resolution;
  uniform vec2 offset;
  uniform float scale;

  float gaussian2D(vec2 point, vec2 center) {
    vec2 d = (point - center);
    return exp(-(d.x * d.x + d.y * d.y) / (2.0 * sigma * sigma));
  }

  void main() {
    vec2 screenPos = vUv * resolution;
    vec2 worldPos = (vec2(screenPos.x, resolution.y - screenPos.y) - offset) / scale;
    float value = 0.0;
    for(int i = 0; i < 2000; i++) {
      if (i >= pointCount) break;
      vec2 pt = texture2D(pointsTexture, vec2((float(i) + 0.5) / 1024.0, 0.5)).xy;
      float val = texture2D(valuesTexture, vec2((float(i) + 0.5) / 1024.0, 0.5)).r;
      value += val * gaussian2D(worldPos, pt);
    }
    if (value > 0.0) {
      gl_FragColor = vec4(1.0, 0.8 * value, 0.0, 0.7);
    } else {
      discard;
    }
  }
`;

export const valleyFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D pointsTexture;
  uniform sampler2D valuesTexture;
  uniform int pointCount;
  uniform float sigma;
  uniform vec2 resolution;
  uniform vec2 offset;
  uniform float scale;

  float gaussian2D(vec2 point, vec2 center) {
    vec2 d = (point - center);
    return exp(-(d.x * d.x + d.y * d.y) / (2.0 * sigma * sigma));
  }

  void main() {
    vec2 screenPos = vUv * resolution;
    vec2 worldPos = (vec2(screenPos.x, resolution.y - screenPos.y) - offset) / scale;
    float value = 0.0;
    for(int i = 0; i < 2000; i++) {
      if (i >= pointCount) break;
      vec2 pt = texture2D(pointsTexture, vec2((float(i) + 0.5) / 1024.0, 0.5)).xy;
      float val = texture2D(valuesTexture, vec2((float(i) + 0.5) / 1024.0, 0.5)).r;
      value += val * gaussian2D(worldPos, pt);
    }
    if (value < 0.0) {
      gl_FragColor = vec4(0.0, 0.5, 1.0, 0.7 * abs(value));
    } else {
      discard;
    }
  }
`;