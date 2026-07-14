pipeline {
  agent any

  options {
    ansiColor('xterm')
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
    timeout(time: 60, unit: 'MINUTES')
    disableConcurrentBuilds()
  }

  environment {
    REGISTRY          = credentials('tskk-registry')                 // e.g. registry.tskk.in
    IMAGE_BACKEND     = "${env.REGISTRY}/tskk/backend"
    IMAGE_FRONTEND    = "${env.REGISTRY}/tskk/frontend"
    IMAGE_TAG         = "${env.BRANCH_NAME.replaceAll('/', '-')}-${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"
    NODE_ENV          = 'production'
    DOCKER_BUILDKIT   = '1'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.COMMIT_MSG = sh(script: "git log -1 --pretty=%B", returnStdout: true).trim()
          echo "Building ${env.GIT_COMMIT} on ${env.BRANCH_NAME}: ${env.COMMIT_MSG}"
        }
      }
    }

    stage('Install dependencies') {
      parallel {
        stage('Backend') {
          steps {
            dir('backend') {
              sh 'pnpm install --frozen-lockfile'
            }
          }
        }
        stage('Frontend') {
          steps {
            dir('frontend') {
              sh 'npm ci'
            }
          }
        }
      }
    }

    stage('Lint & Typecheck') {
      parallel {
        stage('Backend') {
          steps {
            dir('backend') {
              sh 'pnpm run lint'
              sh 'pnpm exec tsc --noEmit'
            }
          }
        }
        stage('Frontend') {
          steps {
            dir('frontend') {
              sh 'npm run lint'
              sh 'npm run typecheck'
            }
          }
        }
      }
    }

    stage('Test') {
      steps {
        dir('backend') {
          sh 'pnpm run test -- --ci --coverage --reporters=default --reporters=jest-junit'
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'backend/junit.xml'
        }
      }
    }

    stage('Build images') {
      parallel {
        stage('Backend') {
          steps {
            sh """
              docker build --pull \\
                --target production \\
                -t ${IMAGE_BACKEND}:${IMAGE_TAG} \\
                -t ${IMAGE_BACKEND}:latest \\
                ./backend
            """
          }
        }
        stage('Frontend') {
          steps {
            sh """
              docker build --pull \\
                --target runner \\
                --build-arg NEXT_PUBLIC_API_URL=${env.NEXT_PUBLIC_API_URL ?: ''} \\
                -t ${IMAGE_FRONTEND}:${IMAGE_TAG} \\
                -t ${IMAGE_FRONTEND}:latest \\
                ./frontend
            """
          }
        }
      }
    }

    stage('Push images') {
      when { branch pattern: 'main|release/.*', comparator: 'REGEXP' }
      steps {
        withCredentials([usernamePassword(credentialsId: 'tskk-registry-auth', usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
          sh '''
            echo "$REG_PASS" | docker login "$REGISTRY" -u "$REG_USER" --password-stdin
            docker push ${IMAGE_BACKEND}:${IMAGE_TAG}
            docker push ${IMAGE_BACKEND}:latest
            docker push ${IMAGE_FRONTEND}:${IMAGE_TAG}
            docker push ${IMAGE_FRONTEND}:latest
          '''
        }
      }
    }

    stage('Deploy') {
      when { branch 'main' }
      steps {
        sshagent(credentials: ['tskk-deploy-ssh']) {
          sh '''
            ssh -o StrictHostKeyChecking=no deploy@${DEPLOY_HOST} <<EOF
              cd /opt/tskk-academy
              docker compose -f docker-compose.prod.yml pull
              docker compose -f docker-compose.prod.yml up -d --remove-orphans
              docker compose -f docker-compose.prod.yml exec -T backend node dist/main.js migrations:run || true
            EOF
          '''
        }
      }
    }
  }

  post {
    success {
      echo "Build succeeded: ${IMAGE_BACKEND}:${IMAGE_TAG}"
    }
    failure {
      echo "Build failed: check the console output"
    }
    always {
      sh 'docker system prune -f --filter "until=48h" || true'
    }
  }
}
