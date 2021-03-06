const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { authService, userService, tokenService, emailService } = require('../services');

const register = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(httpStatus.CREATED).send({ user, tokens });
});


const uploadS3 = catchAsync(async (req, res) => {
  const upload = await userService.uploadToS3(req,res);
  res.send({ upload })

});

const runProcess = catchAsync(async (req, res) => {
  const data = await authService.runProcess()
res.send({data})
})

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);
  const tokens = await tokenService.generateAuthTokens(user);
  res.send({ user, tokens });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
  await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token, req.body.password);
  res.status(httpStatus.NO_CONTENT).send();
});

const getYouTubeLiveVideo = catchAsync(async (req, res) => {
  const videoData = await authService.getYouTubeVideo(req.body);
  await authService.runProcess(req.body.meetingId);
  res.status(httpStatus.OK).send(videoData)
})

const getVideoStreamFromGuest = catchAsync(async (req,res) => {
  const videoFrames = await authService.getVideoStreamFromGuest(req,res)
})

const removeStreaming = catchAsync(async (req,res) => {
  const removedData = await authService.removeStreaming()
  res.send({removedData});
})

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  getYouTubeLiveVideo,
  removeStreaming,
  uploadS3,
  runProcess,
  getVideoStreamFromGuest

};
